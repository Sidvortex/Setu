"""Test setup: a throwaway database + upload folder, and a logged-in official."""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
_tmp = tempfile.mkdtemp(prefix="setu-test-")
if not os.environ.get("SETU_TEST_TURSO"):  # set it (plus TURSO_* vars) to run the suite against a Turso endpoint
    os.environ.pop("TURSO_DATABASE_URL", None)
os.environ.pop("BHOOSURAKSHA_API_URL", None)
os.environ.pop("AI_PROVIDER", None)

import auth  # noqa: E402
import db  # noqa: E402

auth.DB_PATH = os.path.join(_tmp, "auth.db")
db.DB_PATH = os.path.join(_tmp, "setu.db")

import incidents  # noqa: E402  (creates its tables in the temp database)

incidents.UPLOADS = os.path.join(_tmp, "uploads")

from fastapi.testclient import TestClient  # noqa: E402

import app as app_module  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture(scope="session")
def token(client):
    auth.create_user("tester", "tester-pass-123")
    r = client.post("/api/auth/login", json={"username": "tester", "password": "tester-pass-123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def H(token):
    return {"Authorization": f"Bearer {token}"}
