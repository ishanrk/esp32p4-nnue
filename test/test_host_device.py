"""Interactive real engine conformance, not a USB hardware test."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "esp"))
from board_client import HostTransport, ProtocolError
from conformance import conform

with HostTransport([sys.argv[1]]) as board:
    report = conform(board)
assert report["capabilities"]["engine"] == "P4 classical host"
assert report["info"]["target"] == "unknown"
assert report["info"]["model_format"] == 0
assert len(report["observations"]) == 6
print("Interactive custom classical engine passed six legal and terminal positions")

class MalformedResultFixture:
    """Deliberately replace a real reply with an invalid terminal marker."""
    def __init__(self, connection): self.connection = connection
    def request(self, command, payload=b""):
        response = self.connection.request(command, payload)
        return b"\x04" + b"0000" + bytes(24) if command == 0x21 else response

with HostTransport([sys.argv[1]]) as board:
    try:
        conform(MalformedResultFixture(board))
    except ProtocolError as error:
        assert "Go: start:" in str(error)
        assert "legal moves exist" in str(error)
        assert "docs/PROTOCOL.md" in str(error)
    else:
        raise AssertionError("Conformance accepted the malformed result fixture")
print("Conformance failure identifies Go, the position and a protocol remedy")
