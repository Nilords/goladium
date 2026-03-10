"""Shared FastAPI dependencies — rate limiter, password hashing."""
from slowapi import Limiter
from slowapi.util import get_remote_address
from passlib.context import CryptContext

limiter = Limiter(key_func=get_remote_address)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
