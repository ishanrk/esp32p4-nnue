import unittest
import numpy as np
from analyze_errors import metrics, feature_key
class ErrorAnalysisTests(unittest.TestCase):
    def test_metrics(self):
        report = metrics(np.array([100.,-100.,0.]),np.array([50.,100.,0.]))
        self.assertEqual(report["mae_cp"],250/3)
        self.assertEqual(report["sign_agreement"],2/3)
        self.assertIsNone(metrics([],[])["mae_cp"])
    def test_feature_equivalence(self):
        self.assertEqual(feature_key([1,2,10],[3,4,10]),feature_key([2,1,10],[4,3,10]))
        self.assertNotEqual(feature_key([1,2],[3,4]),feature_key([3,4],[1,2]))
if __name__ == "__main__": unittest.main()
