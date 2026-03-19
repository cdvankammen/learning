import pathlib


def test_provision_script_defaults():
    p = pathlib.Path(__file__).parent / "create-lxc-defaults.sh"
    txt = p.read_text(encoding="utf-8")
    # Basic sanity checks for default variables required by the plan
    assert "var_os=debian" in txt
    assert "var_version=13" in txt
    assert "var_unprivileged=1" in txt
    assert "var_cpu=2" in txt
    assert "var_ram=2048" in txt
    assert "var_disk=10" in txt
    assert "var_brg=google" in txt
    assert "var_net=dhcp" in txt
    assert "var_timezone=America/Denver" in txt
    # default provisioning password
    assert "violin" in txt
