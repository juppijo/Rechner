import numpy as np
import matplotlib.pyplot as plt

# x-Werte definieren (Anzahl Cola-Kisten)
x = np.linspace(0, 14, 200)

# Umgestellte Gleichungen nach y (Anzahl Wasser-Kisten)
# I: y = 12 - x
# II: y = (108 - 10*x) / 7
y1 = 12 - x
y2 = (108 - 10 * x) / 7

# Diagramm erstellen
plt.figure(figsize=(8, 6))
plt.plot(x, y1, label='I: x + y = 12 (Gesamtzahl Kisten)', color='blue')
plt.plot(x, y2, label='II: 10x + 7y = 108 (Gesamtkosten)', color='green')

# Schnittpunkt markieren und beschriften (x=8, y=4)
plt.plot(8, 4, 'ro', markersize=8, label='Schnittpunkt (8, 4)')
plt.annotate('Schnittpunkt (8, 4)', 
             xy=(8, 4), 
             xytext=(9, 6),
             arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=6))

# Achsenbeschriftung und Formatierung
plt.xlabel('Anzahl Cola-Kisten (x)')
plt.ylabel('Anzahl Wasser-Kisten (y)')
plt.title('Grafische Lösung des Gleichungssystems')
plt.axhline(0, color='black', linewidth=0.5)
plt.axvline(0, color='black', linewidth=0.5)
plt.grid(True, linestyle='--', alpha=0.7)
plt.legend()

# Diagramm anzeigen
plt.show()