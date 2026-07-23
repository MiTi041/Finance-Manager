from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from finance_server.services.r2_client import R2Client


@pytest.fixture
def mock_s3():
    with patch("boto3.client") as mock:
        yield mock


@pytest.fixture
def client(mock_s3) -> R2Client:
    return R2Client(
        account_id="test-account",
        access_key_id="test-key",
        secret_access_key="test-secret",
        bucket="test-bucket",
    )


class TestR2Client:
    def test_put_object(self, client, mock_s3):
        client.put_object("sync/device/000001.enc", b"encrypted-data")
        mock_s3.return_value.put_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="sync/device/000001.enc",
            Body=b"encrypted-data",
        )

    def test_get_object_found(self, client, mock_s3):
        mock_s3.return_value.get_object.return_value = {"Body": MagicMock(read=MagicMock(return_value=b"data"))}
        result = client.get_object("sync/device/000001.enc")
        assert result == b"data"

    def test_get_object_not_found(self, client, mock_s3):
        from botocore.exceptions import ClientError
        mock_s3.return_value.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey"}}, "get_object"
        )
        result = client.get_object("sync/device/000001.enc")
        assert result is None

    def test_list_objects(self, client, mock_s3):
        paginator_mock = MagicMock()
        paginator_mock.paginate.return_value = [
            {"Contents": [{"Key": "sync/device/000001.enc"}, {"Key": "sync/device/000002.enc"}]}
        ]
        mock_s3.return_value.get_paginator.return_value = paginator_mock
        result = client.list_objects("sync/device/")
        assert result == ["sync/device/000001.enc", "sync/device/000002.enc"]

    def test_head_object_exists(self, client, mock_s3):
        result = client.head_object("sync/key_id")
        assert result is True

    def test_head_object_not_exists(self, client, mock_s3):
        from botocore.exceptions import ClientError
        mock_s3.return_value.head_object.side_effect = ClientError(
            {"Error": {"Code": "NotFound"}}, "head_object"
        )
        result = client.head_object("sync/key_id")
        assert result is False
