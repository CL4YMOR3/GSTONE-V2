import math
from datetime import date, datetime
from typing import Any, Dict, List, Union

def sanitize_nan(obj: Any) -> Any:
    """
    Recursively replace NaN, Inf, and NaT values with None for JSON serialization.
    Also converts numpy types to standard Python types.
    """
    import numpy as np
    import pandas as pd

    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, date):
        return obj.isoformat()
    elif isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    elif isinstance(obj, np.datetime64):
        return pd.Timestamp(obj).isoformat()
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, np.ndarray):
        return [sanitize_nan(i) for i in obj.tolist()]
    elif isinstance(obj, tuple):
        return [sanitize_nan(i) for i in obj]
    elif isinstance(obj, set):
        return [sanitize_nan(i) for i in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        val = float(obj)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    elif isinstance(obj, dict):
        return {str(k): sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan(i) for i in obj]
    elif hasattr(obj, 'to_dict'): # For some specific objects
        return sanitize_nan(obj.to_dict())
    elif not isinstance(obj, (str, int, bool)):
        try:
            if pd.isna(obj):
                # Handles NaT and scalar null-like values
                return None
        except (TypeError, ValueError):
            pass
    
    return obj
