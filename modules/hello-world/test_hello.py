import subprocess
import sys

def test_hello_prints():
    out = subprocess.check_output([sys.executable, "modules/hello-world/hello.py"]).decode()
    assert "hello world" in out.lower()
