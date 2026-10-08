import base64
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hmac
import os

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

PROFILE = os.getenv("AWS_PROFILE", "lab")
REGION = os.getenv("AWS_REGION", "ap-northeast-2")  # 서울

HOST = os.getenv("HOST", "0.0.0.0")  # 외부 접속 허용
PORT = int(os.getenv("PORT", "8000"))
# 이름에 이 문자열이 들어간 리소스만 제어(시작/중지/삭제 등) 가능
OWNER = os.getenv("OWNER_ID", "wnsgh2929")
# 둘 다 설정하면 모든 요청에 Basic 인증을 요구함 (외부 공개 시 권장)
AUTH_USER = os.getenv("BASIC_AUTH_USER")
AUTH_PASS = os.getenv("BASIC_AUTH_PASS")

app = FastAPI(title="AWS 조회 API", description="EC2 / S3 조회 및 검색")
api = APIRouter(prefix="/api")

# 프론트(React 개발 서버)에서 직접 호출할 때 허용할 주소
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


if AUTH_USER and AUTH_PASS:
    expected = base64.b64encode(f"{AUTH_USER}:{AUTH_PASS}".encode()).decode()

    @app.middleware("http")
    async def basic_auth(request, call_next):
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() == "basic" and hmac.compare_digest(token, expected):
            return await call_next(request)
        return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="aws-viewer"'})

session = boto3.Session(profile_name=PROFILE, region_name=REGION)
ec2 = session.client("ec2")
s3 = session.client("s3", config=Config(signature_version="s3v4"))


def aws_error(e: Exception) -> HTTPException:
    if isinstance(e, ClientError):
        code = e.response["Error"]["Code"]
        status = 404 if code in ("NoSuchBucket", "404") else 403 if code in ("AccessDenied", "UnauthorizedOperation") else 502
        return HTTPException(status_code=status, detail=f"{code}: {e.response['Error']['Message']}")
    return HTTPException(status_code=502, detail=f"AWS 호출 실패: {e}")


def matches(keyword: str | None, *values) -> bool:
    if not keyword:
        return True
    kw = keyword.lower()
    return any(kw in str(v).lower() for v in values)


def is_mine(name: str | None) -> bool:
    return OWNER.lower() in (name or "").lower()


def require_mine_bucket(bucket: str):
    if not is_mine(bucket):
        raise HTTPException(status_code=403, detail=f"'{OWNER}'가 포함된 버킷만 제어할 수 있습니다.")


@api.get("/health")
def health():
    return {"status": "ok", "profile": PROFILE, "region": REGION, "owner": OWNER}


@api.get("/ec2")
def list_ec2(keyword: str | None = Query(None, description="이름, ID, 타입, 상태, AZ, IP 검색")):
    try:
        instances = []
        for page in ec2.get_paginator("describe_instances").paginate():
            for reservation in page["Reservations"]:
                instances.extend(reservation["Instances"])
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)

    items = []
    for i in instances:
        name = next((t["Value"] for t in i.get("Tags", []) if t["Key"] == "Name"), "-")
        item = {
            "name": name,
            "instance_id": i["InstanceId"],
            "type": i["InstanceType"],
            "state": i["State"]["Name"],
            "region": REGION,
            "az": i["Placement"]["AvailabilityZone"],
            "private_ip": i.get("PrivateIpAddress"),
            "public_ip": i.get("PublicIpAddress"),
        }
        if matches(keyword, *item.values()):
            item["mine"] = is_mine(name)
            items.append(item)
    return {"count": len(items), "items": items}


def bucket_region(name: str) -> str | None:
    try:
        # us-east-1 버킷은 LocationConstraint가 None으로 반환됨
        return s3.get_bucket_location(Bucket=name)["LocationConstraint"] or "us-east-1"
    except ClientError:
        return None


@api.get("/s3/buckets")
def list_buckets(keyword: str | None = Query(None, description="버킷 이름 검색")):
    try:
        buckets = s3.list_buckets()["Buckets"]
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)

    items = [
        {
            "name": b["Name"],
            "region": bucket_region(b["Name"]),
            "created": b["CreationDate"].isoformat(),
            "mine": is_mine(b["Name"]),
        }
        for b in buckets
        if matches(keyword, b["Name"])
    ]
    return {"count": len(items), "items": items}


@api.get("/s3/buckets/{bucket}/objects")
def list_objects(
    bucket: str,
    prefix: str = Query("", description="경로(prefix)"),
    keyword: str | None = Query(None, description="객체 키 검색"),
):
    try:
        items = []
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            for o in page.get("Contents", []):
                if matches(keyword, o["Key"]):
                    items.append(
                        {
                            "key": o["Key"],
                            "size": o["Size"],
                            "last_modified": o["LastModified"].isoformat(),
                        }
                    )
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)
    return {"bucket": bucket, "mine": is_mine(bucket), "count": len(items), "items": items}


def metric_series(cw, instance_id: str, metric: str, stat: str = "Average", hours: int = 3) -> list[dict]:
    end = dt.datetime.now(dt.timezone.utc)
    points = cw.get_metric_statistics(
        Namespace="AWS/EC2",
        MetricName=metric,
        Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
        StartTime=end - dt.timedelta(hours=hours),
        EndTime=end,
        Period=300,
        Statistics=[stat],
    )["Datapoints"]
    return [{"t": p["Timestamp"].isoformat(), "v": p[stat]} for p in sorted(points, key=lambda p: p["Timestamp"])]


@api.get("/ec2/{instance_id}")
def ec2_detail(instance_id: str):
    """AWS 콘솔의 인스턴스 상세(세부 정보/상태/모니터링/보안/네트워킹/스토리지/태그)."""
    try:
        res = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"]
        if not res:
            raise HTTPException(status_code=404, detail="인스턴스를 찾을 수 없습니다.")
        i = res[0]["Instances"][0]

        st = ec2.describe_instance_status(InstanceIds=[instance_id], IncludeAllInstances=True)["InstanceStatuses"]
        st = st[0] if st else {}

        vol_ids = [b["Ebs"]["VolumeId"] for b in i.get("BlockDeviceMappings", []) if "Ebs" in b]
        volumes = ec2.describe_volumes(VolumeIds=vol_ids)["Volumes"] if vol_ids else []
        attach = {b["Ebs"]["VolumeId"]: b for b in i.get("BlockDeviceMappings", []) if "Ebs" in b}

        sg_ids = [g["GroupId"] for g in i.get("SecurityGroups", [])]
        sgs = ec2.describe_security_groups(GroupIds=sg_ids)["SecurityGroups"] if sg_ids else []

        cw = session.client("cloudwatch")
        monitoring = {
            "cpu": metric_series(cw, instance_id, "CPUUtilization"),
            "network_in": metric_series(cw, instance_id, "NetworkIn", "Sum"),
            "network_out": metric_series(cw, instance_id, "NetworkOut", "Sum"),
        }
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)

    name = tag_name(i.get("Tags"))

    def rules(perms):
        out = []
        for p in perms:
            proto = "전체" if p["IpProtocol"] == "-1" else p["IpProtocol"]
            port = "전체" if p["IpProtocol"] == "-1" else (
                str(p.get("FromPort")) if p.get("FromPort") == p.get("ToPort") else f'{p.get("FromPort")}-{p.get("ToPort")}'
            )
            sources = [r["CidrIp"] for r in p.get("IpRanges", [])] + [g["GroupId"] for g in p.get("UserIdGroupPairs", [])]
            out.append({"protocol": proto, "port": port, "source": ", ".join(sources) or "-"})
        return out

    return {
        "id": instance_id,
        "name": name,
        "mine": is_mine(name),
        "details": {
            "상태": i["State"]["Name"],
            "인스턴스 유형": i["InstanceType"],
            "AMI ID": i["ImageId"],
            "플랫폼": i.get("PlatformDetails", "-"),
            "아키텍처": i.get("Architecture", "-"),
            "시작 시간": i["LaunchTime"].isoformat(),
            "키 페어": i.get("KeyName", "-"),
            "IAM 역할": i.get("IamInstanceProfile", {}).get("Arn", "-"),
            "가용 영역": i["Placement"]["AvailabilityZone"],
            "EBS 최적화": i.get("EbsOptimized", False),
            "상세 모니터링": i.get("Monitoring", {}).get("State", "-"),
        },
        "status": {
            "system": st.get("SystemStatus", {}).get("Status"),
            "instance": st.get("InstanceStatus", {}).get("Status"),
            "ebs": st.get("AttachedEbsStatus", {}).get("Status"),
            "state": st.get("InstanceState", {}).get("Name", i["State"]["Name"]),
        },
        "monitoring": monitoring,
        "security": {
            "iam_role": i.get("IamInstanceProfile", {}).get("Arn", "-"),
            "key_name": i.get("KeyName", "-"),
            "groups": [
                {"id": g["GroupId"], "name": g["GroupName"], "inbound": rules(g["IpPermissions"]), "outbound": rules(g["IpPermissionsEgress"])}
                for g in sgs
            ],
        },
        "networking": {
            "VPC ID": i.get("VpcId", "-"),
            "서브넷 ID": i.get("SubnetId", "-"),
            "프라이빗 IPv4": i.get("PrivateIpAddress", "-"),
            "퍼블릭 IPv4": i.get("PublicIpAddress", "-"),
            "프라이빗 DNS": i.get("PrivateDnsName") or "-",
            "퍼블릭 DNS": i.get("PublicDnsName") or "-",
            "interfaces": [
                {"id": n["NetworkInterfaceId"], "private_ip": n.get("PrivateIpAddress"), "subnet": n.get("SubnetId"), "status": n.get("Status")}
                for n in i.get("NetworkInterfaces", [])
            ],
        },
        "storage": [
            {
                "id": v["VolumeId"],
                "device": attach[v["VolumeId"]]["DeviceName"],
                "size": v["Size"],
                "type": v["VolumeType"],
                "iops": v.get("Iops"),
                "encrypted": v["Encrypted"],
                "state": v["State"],
                "delete_on_termination": attach[v["VolumeId"]]["Ebs"].get("DeleteOnTermination"),
            }
            for v in volumes
        ],
        "tags": [{"key": t["Key"], "value": t["Value"]} for t in i.get("Tags", [])],
    }


# ---------- 제어 (본인 리소스만) ----------
EC2_ACTIONS = {"start": ec2.start_instances, "stop": ec2.stop_instances, "reboot": ec2.reboot_instances}


@api.post("/ec2/{instance_id}/{action}")
def control_ec2(
    instance_id: str,
    action: str,
    dry_run: bool = Query(False, description="실제 실행 없이 권한만 확인"),
):
    if action not in EC2_ACTIONS:
        raise HTTPException(status_code=400, detail=f"지원하는 동작: {', '.join(EC2_ACTIONS)}")
    try:
        res = ec2.describe_instances(InstanceIds=[instance_id])["Reservations"]
        tags = res[0]["Instances"][0].get("Tags", []) if res else []
        name = next((t["Value"] for t in tags if t["Key"] == "Name"), "")
        if not is_mine(name):
            raise HTTPException(status_code=403, detail=f"이름에 '{OWNER}'가 포함된 인스턴스만 제어할 수 있습니다.")
        try:
            EC2_ACTIONS[action](InstanceIds=[instance_id], DryRun=dry_run)
        except ClientError as e:
            if e.response["Error"]["Code"] == "DryRunOperation":
                return {"instance_id": instance_id, "action": action, "dry_run": True, "allowed": True}
            raise
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)
    return {"instance_id": instance_id, "name": name, "action": action, "result": "요청됨"}


@api.delete("/s3/buckets/{bucket}/objects")
def delete_object(bucket: str, key: str = Query(..., description="삭제할 객체 키")):
    require_mine_bucket(bucket)
    try:
        s3.delete_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)
    return {"bucket": bucket, "key": key, "result": "삭제됨"}


@api.get("/s3/buckets/{bucket}/download")
def download_object(bucket: str, key: str = Query(..., description="내려받을 객체 키")):
    require_mine_bucket(bucket)
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{key.rsplit("/", 1)[-1]}"',
            },
            ExpiresIn=60,
        )
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)
    return RedirectResponse(url)


@api.post("/s3/buckets/{bucket}/objects")
def upload_object(
    bucket: str,
    file: UploadFile = File(...),
    prefix: str = Query("", description="저장할 경로(prefix)"),
):
    require_mine_bucket(bucket)
    key = f"{prefix}{file.filename}"
    try:
        s3.upload_fileobj(file.file, bucket, key)
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)
    return {"bucket": bucket, "key": key, "result": "업로드됨"}


# ---------- 조회 전용 (VPC / CloudFront / IAM) ----------
def with_mine(rows: list[dict]) -> list[dict]:
    """항목의 어느 필드든 OWNER 문자열이 들어 있으면 mine=True 로 표시(표시용, 제어 권한과 무관)."""
    return [{**r, "mine": is_mine(" ".join(str(v) for v in r.values()))} for r in rows]


def tag_name(tags) -> str:
    return next((t["Value"] for t in tags or [] if t["Key"] == "Name"), "-")


@api.get("/vpc")
def list_vpc(keyword: str | None = Query(None, description="이름, ID, CIDR 등 검색")):
    try:
        vpcs = ec2.describe_vpcs()["Vpcs"]
        subnets = ec2.describe_subnets()["Subnets"]
        sgs = ec2.describe_security_groups()["SecurityGroups"]
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)

    out = {
        "vpcs": [
            {"name": tag_name(v.get("Tags")), "id": v["VpcId"], "cidr": v["CidrBlock"],
             "state": v["State"], "default": v["IsDefault"]}
            for v in vpcs
        ],
        "subnets": [
            {"name": tag_name(x.get("Tags")), "id": x["SubnetId"], "vpc_id": x["VpcId"],
             "cidr": x["CidrBlock"], "az": x["AvailabilityZone"],
             "public_ip_on_launch": x["MapPublicIpOnLaunch"]}
            for x in subnets
        ],
        "security_groups": [
            {"name": g["GroupName"], "id": g["GroupId"], "vpc_id": g.get("VpcId"),
             "description": g["Description"], "inbound_rules": len(g["IpPermissions"]),
             "outbound_rules": len(g["IpPermissionsEgress"])}
            for g in sgs
        ],
    }
    for key in out:
        out[key] = with_mine([r for r in out[key] if matches(keyword, *r.values())])
    out["count"] = sum(len(v) for v in out.values())
    return out


@api.get("/cloudfront")
def list_cloudfront(keyword: str | None = Query(None, description="ID, 도메인, 설명 검색")):
    try:
        items = []
        for page in session.client("cloudfront").get_paginator("list_distributions").paginate():
            items.extend(page.get("DistributionList", {}).get("Items", []))
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)

    rows = [
        {
            "id": d["Id"],
            "domain": d["DomainName"],
            "aliases": ", ".join(d.get("Aliases", {}).get("Items", [])) or "-",
            "origins": ", ".join(o["DomainName"] for o in d["Origins"]["Items"]),
            "status": d["Status"],
            "enabled": d["Enabled"],
            "comment": d.get("Comment") or "-",
        }
        for d in items
    ]
    rows = with_mine([r for r in rows if matches(keyword, *r.values())])
    return {"count": len(rows), "items": rows}


@api.get("/iam")
def list_iam(keyword: str | None = Query(None, description="이름, ARN 검색")):
    iam = session.client("iam")
    try:
        users, roles = [], []
        for page in iam.get_paginator("list_users").paginate():
            users.extend(page["Users"])
        for page in iam.get_paginator("list_roles").paginate():
            roles.extend(page["Roles"])
    except (BotoCoreError, ClientError) as e:
        raise aws_error(e)

    out = {
        "users": [
            {"name": u["UserName"], "arn": u["Arn"], "created": u["CreateDate"].isoformat(),
             "last_used": u["PasswordLastUsed"].isoformat() if u.get("PasswordLastUsed") else None}
            for u in users
        ],
        "roles": [
            {"name": r["RoleName"], "arn": r["Arn"], "created": r["CreateDate"].isoformat(),
             "description": r.get("Description") or "-"}
            for r in roles
        ],
    }
    for key in out:
        out[key] = with_mine([r for r in out[key] if matches(keyword, *r.values())])
    out["count"] = sum(len(v) for v in out.values())
    return out


# ---------- 홈 대시보드 요약 ----------
@api.get("/summary")
def summary():
    """각 서비스의 개수를 한 번에 모아 반환(홈 화면용). 서비스별로 실패해도 나머지는 반환."""

    def safe(fn):
        try:
            return fn()
        except Exception:  # 권한 없음 등 — 해당 카드만 비움
            return None

    def ec2_sum():
        items = list_ec2(keyword=None)["items"]
        states: dict[str, int] = {}
        for i in items:
            states[i["state"]] = states.get(i["state"], 0) + 1
        return {
            "total": len(items),
            "states": states,
            "mine": sum(i["mine"] for i in items),
            "my_instances": [
                {k: i[k] for k in ("name", "instance_id", "type", "state", "public_ip")} for i in items if i["mine"]
            ],
        }

    def s3_sum():
        names = [b["Name"] for b in s3.list_buckets()["Buckets"]]
        return {"total": len(names), "mine": sum(is_mine(n) for n in names)}

    def vpc_sum():
        d = list_vpc(keyword=None)
        return {k: {"total": len(d[k]), "mine": sum(r["mine"] for r in d[k])} for k in ("vpcs", "subnets", "security_groups")}

    def cf_sum():
        d = list_cloudfront(keyword=None)["items"]
        return {"total": len(d), "mine": sum(r["mine"] for r in d)}

    def iam_sum():
        d = list_iam(keyword=None)
        return {k: {"total": len(d[k]), "mine": sum(r["mine"] for r in d[k])} for k in ("users", "roles")}

    jobs = {"ec2": ec2_sum, "s3": s3_sum, "vpc": vpc_sum, "cloudfront": cf_sum, "iam": iam_sum}
    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        futures = {k: pool.submit(safe, fn) for k, fn in jobs.items()}
        return {k: f.result() for k, f in futures.items()}


app.include_router(api)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
