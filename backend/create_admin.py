"""
Creates an authority login account. Run this once per person who needs
access to the Authority Command Center - there is no public sign-up page
by design.

Usage:
    python create_admin.py <username> <password>
"""
import sys

from auth import create_user

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python create_admin.py <username> <password>")
        sys.exit(1)
    username, password = sys.argv[1], sys.argv[2]
    if len(password) < 8:
        print("Use a password of at least 8 characters.")
        sys.exit(1)
    create_user(username, password)
    print(f"Created authority account: {username}")
