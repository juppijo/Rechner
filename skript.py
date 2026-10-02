import matplotlib.pyplot as plt
import numpy as np
from pyscript import display

# Alte Plots schließen
plt.close('all')

# Wertebereich für das Alter der Tochter (y)
y = np.linspace(0, 25, 400)

# Gleichungen nach x (Alter der Mutter) umgeformt:
# I: x = 48 - y
# II: x = 2y + 3
x1 = 48 - y
x2 = 2 * y + 3

# Schnittpunkt
y_intersect = 15
x_intersect = 33

# Diagramm erstellen
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(y, x1, label='I: x + y = 48 (Summe)', color='#1e66f5', linewidth=2)
ax.plot(y, x2, label='II: x = 2y + 3 (Verhältnis)', color='#40a02b', linewidth=2)

# Schnittpunkt markieren
ax.plot(y_intersect, x_intersect, 'ro', markersize=8, label='Schnittpunkt (15, 33)')
ax.annotate(
    f'Schnittpunkt\nTochter: {y_intersect} J.\nMutter: {x_intersect} J.',
    xy=(y_intersect, x_intersect),
    xytext=(y_intersect - 6, x_intersect + 4),
    arrowprops=dict(facecolor='black', shrink=0.05, width=1.5, headwidth=6),
    fontsize=10,
    bbox=dict(boxstyle="round,pad=0.3", fc="yellow", ec="b", lw=1, alpha=0.7)
)

ax.set_xlabel('Alter der Tochter (y)', fontsize=11)
ax.set_ylabel('Alter der Mutter (x)', fontsize=11)
ax.set_title('Grafische Lösung des Gleichungssystems', fontsize=13, fontweight='bold')
ax.grid(True, linestyle='--', alpha=0.6)
ax.legend(loc='upper right')
plt.tight_layout()

# Grafik im Ausgabefeld anzeigen
display(fig, target="plot-output")
