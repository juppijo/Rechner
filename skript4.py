import matplotlib.pyplot as plt
import numpy as np

# X-Wertebereich definieren (Anzahl Schafe von 0 bis 25)
x = np.linspace(0, 25, 100)

# Gleichungen nach y (Hühner) umstellen:
# 1) y = 25 - x
# 2) y = (70 - 4x) / 2 = 35 - 2x
y1 = 25 - x
y2 = 35 - 2 * x

plt.figure(figsize=(8, 6))

# Geraden zeichnen
plt.plot(x, y1, label='Köpfe: $x + y = 25$', color='blue')
plt.plot(x, y2, label='Beine: $4x + 2y = 70$', color='orange')

# Schnittpunkt hervorheben
plt.plot(10, 15, 'ro', markersize=8, label='Schnittpunkt (10, 15)')
plt.annotate('Schnittpunkt (10 Schafe, 15 Hühner)', xy=(10, 15), xytext=(12, 18),
             arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=6))

# Diagramm beschriften
plt.title('Grafische Lösung der Textaufgabe')
plt.xlabel('Anzahl Schafe (x)')
plt.ylabel('Anzahl Hühner (y)')
plt.xlim(0, 25)
plt.ylim(0, 35)
plt.grid(True)
plt.legend()

plt.show()