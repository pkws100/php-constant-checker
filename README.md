# PHP Konstanten Checker für Visual Studio Code

Diese Erweiterung für Visual Studio Code überprüft die Verwendung von PHP-Konstanten in Ihrem Code und hebt hervor, ob sie definiert sind oder nicht. Sie hilft Entwicklern dabei, Fehler durch undefinierte Konstanten zu vermeiden und den Code sauberer zu gestalten.

## Funktionen

- **Erkennung von PHP-Konstanten**: Erkennt alle verwendeten Konstanten in PHP-Dateien.
- **Überprüfung auf Definition**: Prüft, ob die verwendeten Konstanten in einer angegebenen `constant.php`-Datei definiert sind.
- **Hervorhebung im Code**: Markiert definierte Konstanten **grün** und undefinierte Konstanten **rot**.
- **Unterstützung von offenen PHP-Tags**: Funktioniert auch in Dateien ohne schließendes `?>`-Tag.
- **Live-Aktualisierung**: Aktualisiert die Hervorhebungen beim Bearbeiten, Speichern und Wechseln zwischen Dateien.

## Installation

1. **Repository klonen**:

```bash  
    git clone https://github.com/pow100/php-konstanten-checker.git

```
2. **Ahängigkeiten installieren**:

```bash  
    cd php-konstanten-checker
    npm install

```

3. **Eigene Einstellungen anpassen**:

```json
    "contributes": {
        "configuration": {
            "type": "object",
            "title": "Konstanten Checker Einstellungen",
            "properties": {
            "constantChecker.constantFile": {
                "type": "string",
                "default": "C:/inetpub/pkws_wwwroot/Firmware/SCR/constant.php",
                "description": "Der Pfad zur Datei, die die definierten Konstanten enthält."
            }
            }
        }
    }
```