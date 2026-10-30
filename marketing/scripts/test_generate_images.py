"""Checks the landing's sample data and the image generator's HTML.
Run: python3 -I marketing/scripts/test_generate_images.py"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_images as gen  # noqa: E402

DUMMY_TAX_IDS = {"12345678Z", "A12345674", "B12345674"}


class SampleData(unittest.TestCase):
    def setUp(self):
        self.samples = gen.load_samples()

    def test_three_samples_with_unique_ids(self):
        self.assertEqual([s["id"] for s in self.samples], ["clean", "photo", "irpf"])

    def test_totals_add_up(self):
        for s in self.samples:
            inv = s["invoice"]
            expected = inv["net_amount"] + inv["vat_amount"] - (inv["withholding_amount"] or 0)
            self.assertAlmostEqual(expected, inv["total_amount"], delta=0.01, msg=s["id"])

    def test_only_dummy_tax_ids(self):
        for s in self.samples:
            inv = s["invoice"]
            self.assertIn(inv["supplier_tax_id"], DUMMY_TAX_IDS, s["id"])
            self.assertIn(inv["customer_tax_id"], DUMMY_TAX_IDS, s["id"])

    def test_names_are_obviously_made_up(self):
        for s in self.samples:
            for key in ("supplier_name", "customer_name"):
                self.assertIn("Ejemplo", s["invoice"][key], f"{s['id']}.{key}")

    def test_issues_point_at_real_fields(self):
        for s in self.samples:
            for issue in s["issues"]:
                self.assertIn(issue["field"], s["invoice"])
                self.assertTrue(issue["es"] and issue["en"])


class Html(unittest.TestCase):
    def test_invoice_shows_spanish_amounts(self):
        irpf = next(s for s in gen.load_samples() if s["id"] == "irpf")
        html = gen.invoice_html(irpf)
        self.assertIn("1.060,00 €", html)
        self.assertIn("-150,00 €", html)

    def test_screens_use_the_apps_spanish_labels(self):
        html = gen.screen_html("records", "light")
        for label in ("Registros", "Proveedor", "NIF proveedor", "Base imponible", "Por revisar"):
            self.assertIn(label, html)

    def test_dark_screens_use_dark_tokens(self):
        self.assertIn("#0c0a09", gen.screen_html("review", "dark"))
        self.assertNotIn("#0c0a09", gen.screen_html("review", "light"))

    def test_names_are_escaped(self):
        self.assertEqual(gen.esc("<b>&"), "&lt;b&gt;&amp;")


if __name__ == "__main__":
    unittest.main()
