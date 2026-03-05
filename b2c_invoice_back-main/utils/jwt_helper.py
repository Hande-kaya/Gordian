"""
JWT Helper - Token creation using PyJWT.

Uses the same JWT_SECRET_KEY and JWT_ALGORITHM as the existing auth system
to ensure tokens are compatible across all backends.
Includes jti (unique ID) for token revocation support.
"""

import uuid

import jwt
from datetime import datetime, timedelta
from config import config


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """
    Create JWT access token with unique jti for revocation support.

    Args:
        data: Payload data (user_id, email, role, etc.)
        expires_delta: Custom expiration time

    Returns:
        Encoded JWT string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            seconds=config.JWT_ACCESS_TOKEN_EXPIRES
        )

    to_encode["exp"] = expire
    to_encode["iat"] = datetime.utcnow()
    to_encode["jti"] = str(uuid.uuid4())

    encoded_jwt = jwt.encode(
        to_encode,
        config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM
    )

    return encoded_jwt
