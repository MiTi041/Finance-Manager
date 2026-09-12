from __future__ import annotations

from lxml import etree

from fints.camt_parser import camt053_to_dict

_CAMT_WITH_SPLIT_PURPOSE = b"""<?xml version="1.0" encoding="UTF-8"?>
<Document>
  <Rpt>
    <Acct><Ccy>EUR</Ccy></Acct>
    <Ntry>
      <Amt Ccy="EUR">123.45</Amt>
      <CdtDbtInd>DBIT</CdtDbtInd>
      <ValDt><Dt>2026-09-10</Dt></ValDt>
      <BookgDt><Dt>2026-09-10</Dt></BookgDt>
      <NtryDtls><TxDtls><RmtInf>
        <Ustrd>Allokation bafoeg tag.bafoegschulden.entnahme</Ustrd>
        <Ustrd>10.09.2026</Ustrd>
      </RmtInf></TxDtls></NtryDtls>
    </Ntry>
  </Rpt>
</Document>"""


def test_split_verwendungszweck_keeps_separator():
    # Banken splitten den Verwendungszweck auf mehrere <Ustrd>-Zeilen.
    # Ohne Trennzeichen würde der Tag mit dem Datum verschmelzen
    # ("tag.bafoegschulden.entnahme10.09.2026").
    data = camt053_to_dict(_CAMT_WITH_SPLIT_PURPOSE)
    assert data[0]["purpose"] == "Allokation bafoeg tag.bafoegschulden.entnahme 10.09.2026"


def test_repeated_leaf_elements_are_space_joined():
    xml = (
        "<RmtInf>"
        "<Ustrd>Allokation bafoeg tag.bafoegschulden.entnahme</Ustrd>"
        "<Ustrd>10.09.2026</Ustrd>"
        "</RmtInf>"
    )
    from fints.camt_parser import _parse_element

    parsed = _parse_element(etree.fromstring(xml))
    assert parsed["Unstructured"] == "Allokation bafoeg tag.bafoegschulden.entnahme 10.09.2026"
