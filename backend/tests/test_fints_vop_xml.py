from __future__ import annotations

from fints.client import _extract_vop_xml_result
from fints.segments.auth import HIVPP1

_RCVC_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.10"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrPmtStsRpt>
    <OrgnlPmtInfAndSts>
      <TxInfAndSts>
        <TxSts>RCVC</TxSts>
      </TxInfAndSts>
    </OrgnlPmtInfAndSts>
  </CstmrPmtStsRpt>
</Document>"""

_RVNM_XML = _RCVC_XML.replace(b">RCVC<", b">RVNM<")


def _hivpp(report) -> HIVPP1:
    seg = HIVPP1()
    seg.payment_status_report = report
    return seg


def test_extract_rcvc_from_pain002():
    assert _extract_vop_xml_result(_hivpp(_RCVC_XML)) == "RCVC"


def test_extract_rvnm_from_pain002():
    assert _extract_vop_xml_result(_hivpp(_RVNM_XML)) == "RVNM"


def test_extract_none_without_report():
    assert _extract_vop_xml_result(HIVPP1()) is None


def test_extract_none_with_garbage():
    assert _extract_vop_xml_result(_hivpp(b"not xml at all")) is None
