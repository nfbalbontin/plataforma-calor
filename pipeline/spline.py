"""Spline cúbico natural (restringido): lineal fuera de los nudos extremos. Lo comparten el modelo y sus aplicaciones."""
import numpy as np

NUDOS_P = (10, 50, 75, 90, 97)


def rcs(x, k):
    """Devuelve len(k)-1 columnas: x y los términos cúbicos restringidos."""
    x = np.asarray(x, float)
    k = np.asarray(k, float)
    esc = (k[-1] - k[0]) ** 2
    cols = [x]
    p3 = lambda v: np.where(v > 0, v, 0) ** 3
    for j in range(len(k) - 2):
        cols.append((p3(x - k[j]) - p3(x - k[-2]) * (k[-1] - k[j]) / (k[-1] - k[-2])
                     + p3(x - k[-1]) * (k[-2] - k[j]) / (k[-1] - k[-2])) / esc)
    return np.column_stack(cols)
