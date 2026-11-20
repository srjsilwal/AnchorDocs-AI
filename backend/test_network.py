import socket

# Or your pooler host: aws-0-...pooler.supabase.com
host = "db.vzhjjfaiehtqsqxocapz.supabase.co"
try:
    ip = socket.gethostbyname(host)
    print(f"✅ Success! Resolved {host} to IP: {ip}")
except socket.gaierror as e:
    print(f"❌ Failed to resolve host: {e}")
    print("-> This confirms a local network, VPN, or Firewall issue.")
