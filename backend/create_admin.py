"""
Creates an authority login account, or changes an existing account's password.
Run it once per person who needs access - there is no public sign-up page by design.

Usage:
    python create_admin.py <username>            # asks for the password (not saved in shell history)
    python create_admin.py <username> --reset    # change the password of an existing account
    python create_admin.py <username> <password> # non-interactive (password ends up in shell history)

To create accounts on the deployed site, set TURSO_DATABASE_URL and
TURSO_AUTH_TOKEN in this terminal first (see the deployment guide in docs/).
"""
import getpass
import sys

from auth import create_user, get_user_by_username, set_password


def ask_password() -> str:
    first = getpass.getpass("Password (min 10 characters): ")
    if getpass.getpass("Repeat password: ") != first:
        print("Passwords don't match.")
        sys.exit(1)
    return first


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or len(args) > 2:
        print(__doc__)
        sys.exit(1)
    username = args[0]
    reset = len(args) == 2 and args[1] == "--reset"
    password = args[1] if len(args) == 2 and not reset else ask_password()
    if len(password) < 10:
        print("Use a password of at least 10 characters.")
        sys.exit(1)
    exists = get_user_by_username(username) is not None
    if reset:
        if not exists:
            print(f"No account named {username}. Leave out --reset to create it.")
            sys.exit(1)
        set_password(username, password)
        print(f"Password changed for: {username}")
    elif exists:
        print(f"{username} already exists. To change its password: python create_admin.py {username} --reset")
        sys.exit(1)
    else:
        create_user(username, password)
        print(f"Created authority account: {username}")
