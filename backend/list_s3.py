import argparse

import boto3
from botocore.exceptions import BotoCoreError, ClientError

PROFILE = "lab"
REGION = "ap-northeast-2"  # 서울

HEADERS = ["Bucket", "Region", "Created"]


def parse_args():
    parser = argparse.ArgumentParser(description="S3 버킷 조회/검색")
    parser.add_argument("keyword", nargs="?", help="검색어 (버킷 이름 일부, 대소문자 무시)")
    parser.add_argument("-b", "--bucket", help="지정한 버킷 안의 객체 목록을 조회")
    parser.add_argument("-p", "--prefix", default="", help="--bucket 사용 시 경로(prefix) 지정")
    return parser.parse_args()


def print_table(headers, rows):
    widths = [max(len(str(r[c])) for r in [headers] + rows) for c in range(len(headers))]
    for r in [headers] + rows:
        print("  ".join(str(v).ljust(w) for v, w in zip(r, widths)))


def get_region(s3, name):
    try:
        # us-east-1 버킷은 LocationConstraint가 None으로 반환됨
        return s3.get_bucket_location(Bucket=name)["LocationConstraint"] or "us-east-1"
    except ClientError:
        return "-"


def list_buckets(s3, keyword):
    buckets = s3.list_buckets()["Buckets"]
    if keyword:
        kw = keyword.lower()
        buckets = [b for b in buckets if kw in b["Name"].lower()]
    return [
        [b["Name"], get_region(s3, b["Name"]), b["CreationDate"].strftime("%Y-%m-%d %H:%M")]
        for b in buckets
    ]


def list_objects(s3, bucket, prefix, keyword):
    paginator = s3.get_paginator("list_objects_v2")
    rows = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for o in page.get("Contents", []):
            rows.append([o["Key"], o["Size"], o["LastModified"].strftime("%Y-%m-%d %H:%M")])
    if keyword:
        kw = keyword.lower()
        rows = [r for r in rows if kw in r[0].lower()]
    return rows


def main():
    args = parse_args()
    session = boto3.Session(profile_name=PROFILE, region_name=REGION)
    s3 = session.client("s3")

    try:
        if args.bucket:
            headers = ["Key", "Size(B)", "LastModified"]
            rows = list_objects(s3, args.bucket, args.prefix, args.keyword)
            empty_msg = "조건에 맞는 객체가 없습니다."
        else:
            headers = HEADERS
            rows = list_buckets(s3, args.keyword)
            empty_msg = "조건에 맞는 S3 버킷이 없습니다."
    except (BotoCoreError, ClientError) as e:
        print(f"S3 조회 실패: {e}")
        return

    if not rows:
        print(empty_msg)
        return

    print_table(headers, rows)


if __name__ == "__main__":
    main()
