import matplotlib.pyplot as plt
import numpy as np

# Beispiel-Gleichungssystem:
# I:  x + y = 6   -> y = 6 - x
# II: 2x - y = 3  -> y = 2x - 3
# Schnittpunkt / Lösung: S(3, 3)

# Wertebereich für x
x = np.linspace(-1, 7, 400)

# Gleichungen nach y umgestellt
y1 = 6 - x
y2 = 2 * x - 3

# Schnittpunkt
x_intersect = 3
y_intersect = 3

# Diagramm erstellen
plt.figure(figsize=(8, 6))
plt.plot(x, y1, label='Gleichung I: $x + y = 6$', color='blue')
plt.plot(x, y2, label='Gleichung II: $2x - y = 3$', color='green')

# Schnittpunkt hervorheben
plt.plot(x_intersect, y_intersect, 'ro', markersize=8, label=f'Schnittpunkt S({x_intersect}, {y_intersect})')
plt.annotate(f'  S({x_intersect}, {y_intersect})', (x_intersect, y_intersect), fontsize=12, color='red')

# Achsen und Layout
plt.axhline(0, color='black', linewidth=0.8, linestyle='--')
plt.axvline(0, color='black', linewidth=0.8, linestyle='--')
plt.grid(True, linestyle=':', alpha=0.6)
plt.xlabel('x')
plt.ylabel('y')
plt.title('Grafische Lösung des Gleichungssystems')
plt.legend()

# Graph anzeigen
plt.show()