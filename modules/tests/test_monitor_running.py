import subprocess


def test_container_502_running():
    # Ensure the monitor container (502) is present and running
    res = subprocess.run(['pct', 'status', '502'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = res.stdout + res.stderr
    assert b'status: running' in out, out.decode()
