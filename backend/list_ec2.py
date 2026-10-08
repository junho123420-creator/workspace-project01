import argparse

import boto3
from botocore.exceptions import BotoCoreError, ClientError

PROFILE = "lab"
REGION = "ap-northeast-2"  # 서울

HEADERS = ["Name", "InstanceId", "Type", "State", "Region", "AZ", "PrivateIP", "PublicIP"]


def get_name(tags):
    for tag in tags or []:
        if tag["Key"] == "Name":
            return tag["Value"]
    return "-"


def parse_args():
    parser = argparse.ArgumentParser(description="EC2 인스턴스 조회/검색")
    parser.add_argument(
        "keyword",
        nargs="?",
        help="검색어 (이름, ID, 타입, 상태, AZ, IP 중 일부, 대소문자 무시)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    session = boto3.Session(profile_name=PROFILE, region_name=REGION)
    ec2 = session.client("ec2")

    try:
        paginator = ec2.get_paginator("describe_instances")
        instances = []
        for page in paginator.paginate():
            for reservation in page["Reservations"]:
                instances.extend(reservation["Instances"])
    except (BotoCoreError, ClientError) as e:
        print(f"EC2 조회 실패: {e}")
        return

    if not instances:
        print("EC2 인스턴스가 없습니다.")
        return

    rows = [
        [
            get_name(i.get("Tags")),
            i["InstanceId"],
            i["InstanceType"],
            i["State"]["Name"],
            REGION,
            i["Placement"]["AvailabilityZone"],
            i.get("PrivateIpAddress", "-"),
            i.get("PublicIpAddress", "-"),
        ]
        for i in instances
    ]

    if args.keyword:
        kw = args.keyword.lower()
        rows = [r for r in rows if any(kw in str(v).lower() for v in r)]
        if not rows:
            print(f"'{args.keyword}'에 해당하는 인스턴스가 없습니다.")
            return

    widths = [max(len(str(r[c])) for r in [HEADERS] + rows) for c in range(len(HEADERS))]
    for r in [HEADERS] + rows:
        print("  ".join(str(v).ljust(w) for v, w in zip(r, widths)))


if __name__ == "__main__":
    main()
