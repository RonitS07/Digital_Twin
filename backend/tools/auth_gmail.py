from gmail_tool import get_gmail_service

if __name__ == "__main__":
    service = get_gmail_service()
    profile = service.users().getProfile(userId="me").execute()
    print(f"Authenticated as: {profile['emailAddress']}")