import * as vscode from 'vscode';
import * as fs from 'fs';

// Diagnose-Sammlung für unsere Erweiterung
let diagnosticCollection: vscode.DiagnosticCollection;

// Liste der PHP-Build-In-Konstanten, die nicht als undefiniert markiert werden sollen
const phpBuiltInConstants = [
    'E_ERROR', 'E_WARNING', 'E_PARSE', 'E_NOTICE', 'E_CORE_ERROR', 'E_CORE_WARNING',
    'E_COMPILE_ERROR', 'E_COMPILE_WARNING', 'E_USER_ERROR', 'E_USER_WARNING',
    'E_USER_NOTICE', 'E_STRICT', 'E_RECOVERABLE_ERROR', 'E_DEPRECATED',
    'E_USER_DEPRECATED', 'E_ALL', 'PHP_VERSION', 'PHP_OS', 'PHP_EOL', 'PHP_INT_MAX',
    'PHP_INT_MIN', 'PHP_FLOAT_MAX', 'PHP_FLOAT_MIN', 'PHP_SAPI', '_SERVER', '_POST',
    '_GET', '_FILES', '_COOKIE', '_SESSION', '_REQUEST', '_ENV', 'REQUEST_METHOD'
];

// Definieren der Dekorationstypen für definierte und undefinierte Konstanten
const definedConstantDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline; color: green; font-weight: bold;'
});

const undefinedConstantDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline; color: red; font-weight: bold;'
});

/**
 * Lädt alle Konstanten aus der angegebenen Datei, die mit define_ex definiert wurden.
 * 
 * @param filePath - Der Pfad zur Datei, aus der die Konstanten geladen werden sollen.
 * @returns Ein Array von Konstantennamen als Strings.
 */
function loadConstants(filePath: string): string[] {
    const constants: string[] = [];
    try {
        // Lese den Inhalt der Datei
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        // Regex zum Finden von Konstantendefinitionen mit define_ex
        const regex = /define_ex\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;
        let match;
        // Iteriere über alle gefundenen Konstanten
        while ((match = regex.exec(fileContent)) !== null) {
            constants.push(match[1]);
        }
    } catch (error) {
        if (error instanceof Error) {
            vscode.window.showErrorMessage(`Fehler beim Laden der Konstanten aus ${filePath}: ${error.message}`);
        } else {
            vscode.window.showErrorMessage(`Fehler beim Laden der Konstanten aus ${filePath}: Unbekannter Fehler`);
        }
    }
    return constants;
}

/**
 * Maskiert Kommentare und Strings im PHP-Code, um sie bei der Analyse zu ignorieren.
 * Ersetzt den Inhalt von Kommentaren und Strings durch Leerzeichen gleicher Länge.
 * 
 * @param text - Der PHP-Code als String.
 * @returns Der maskierte PHP-Code.
 */
function maskCommentsAndStrings(text: string): string {
    return text.replace(/\/\/.*|\/\*[\s\S]*?\*\/|#.*|(['"])(?:\\.|[^\\])*?\1/g, (match) => ' '.repeat(match.length));
}

/**
 * Wendet Dekorationen auf die definierten und undefinierten Konstanten im Dokument an.
 * 
 * @param document - Das aktuelle Textdokument.
 * @param constants - Ein Array von definierten Konstantennamen.
 */
function applyDecorations(document: vscode.TextDocument, constants: string[]) {
    // Finde den aktiven Editor für das Dokument
    const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
    if (!editor) {
        return;
    }

    const text = document.getText();

    // Regex zum Finden von PHP-Codeblöcken
    //const phpTagRegex = /<\?php[\s\S]*?\?>|<\?=([\s\S]*?)\?>/g;
	// Aktualisierte Regex zum Finden von PHP-Codeblöcken
    const phpTagRegex = /<\?php[\s\S]*?(?:\?>|$)|<\?=([\s\S]*?)(?:\?>|$)/g;
						
    let phpMatch;

    // Arrays zum Speichern der Bereiche für definierte und undefinierte Konstanten
    const definedRanges: vscode.Range[] = [];
    const undefinedRanges: vscode.Range[] = [];

    // Iteriere über alle PHP-Codeblöcke
    while ((phpMatch = phpTagRegex.exec(text)) !== null) {
        const phpCode = phpMatch[0];
        const phpStartIndex = phpMatch.index;

        // Maskiere Kommentare und Strings innerhalb des PHP-Codes
        const maskedPhpCode = maskCommentsAndStrings(phpCode);

        // Regex zum Finden von Konstanten im maskierten PHP-Code
        const constantRegex = /\b[A-Z][A-Z0-9_]*\b/g;
        let match;
        // Iteriere über alle gefundenen Konstanten
        while ((match = constantRegex.exec(maskedPhpCode)) !== null) {
            const constant = match[0];
            const constantStartIndex = phpStartIndex + match.index;
            const constantEndIndex = constantStartIndex + constant.length;

            // Überprüfe das vorangehende Zeichen, um sicherzustellen, dass es sich nicht um eine Variable oder einen Methodenaufruf handelt
            const precedingChars = text.slice(Math.max(0, constantStartIndex - 2), constantStartIndex);
            let exclude = false;

            if (precedingChars.endsWith('$')) {
                // Es handelt sich um eine Variable, ausschließen
                exclude = true;
            } else if (precedingChars.endsWith('::')) {
                // Statischer Zugriff (::), ausschließen
                exclude = true;
            } else if (precedingChars.endsWith('->')) {
                // Objektzugriff (->), ausschließen
                exclude = true;
            }
            // Entfernen Sie die folgende Bedingung, um nicht fälschlicherweise Konstanten auszuschließen
            // else if (/[A-Za-z0-9_]$/.test(precedingChars)) {
            //     exclude = true;
            // }

            if (exclude) {
                continue;
            }

            // Ignoriere Konstanten, die mit 'TXT_CHAR' oder 'TEXT' beginnen
            if (constant.startsWith('TXT_CHAR') || constant.startsWith('TEXT')) {
                continue;
            }

            // PHP-Build-In-Konstanten ignorieren
            if (phpBuiltInConstants.includes(constant)) {
                continue;
            }

            const startPos = document.positionAt(constantStartIndex);
            const endPos = document.positionAt(constantEndIndex);
            const range = new vscode.Range(startPos, endPos);

            // Überprüfe, ob die Konstante definiert ist, und füge sie der entsprechenden Liste hinzu
            if (constants.includes(constant)) {
                definedRanges.push(range);
            } else {
                undefinedRanges.push(range);
            }
        }
    }

    // Anwenden der Dekorationen auf die gefundenen Bereiche
    editor.setDecorations(definedConstantDecoration, definedRanges);
    editor.setDecorations(undefinedConstantDecoration, undefinedRanges);
}

/**
 * Diese Funktion wird aufgerufen, wenn die Erweiterung aktiviert wird.
 * Sie initialisiert die Erweiterung und registriert die erforderlichen Event-Listener.
 * 
 * @param context - Der Kontext der Erweiterung.
 */
export function activate(context: vscode.ExtensionContext) {
    // Erstellen einer eigenen DiagnosticCollection für unsere Erweiterung
    diagnosticCollection = vscode.languages.createDiagnosticCollection('constantChecker');
    context.subscriptions.push(diagnosticCollection);

    // Standardpfad zur Konstantendatei (kann über die Einstellungen überschrieben werden)
    let filePath = vscode.workspace.getConfiguration('constantChecker').get('constantFile', 'C:/inetpub/pkws_wwwroot/Firmware/SCR/constant.php');

    // Laden der Konstanten aus der angegebenen Datei
    const constants = loadConstants(filePath);

    // Event-Listener für das Öffnen von Textdokumenten
    vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'php' || document.fileName.endsWith('.php') ) {
            applyDecorations(document, constants);
        }
    });

    // Event-Listener für Änderungen an Textdokumenten
    vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;
        if (document.languageId === 'php' || document.fileName.endsWith('.php') ) {
            applyDecorations(document, constants);
        }
    });

    // Anwenden der Dekorationen auf alle geöffneten PHP-Dokumente beim Start der Erweiterung
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
            applyDecorations(document, constants);
        }
    });

    // Anwenden der Dekorationen auf alle sichtbaren Editoren beim Start der Erweiterung
    vscode.window.visibleTextEditors.forEach(editor => {
        const document = editor.document;
        if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
            applyDecorations(document, constants);
        }
    });

    // Event-Listener für den Wechsel des aktiven Editors
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'php'  ) {
            applyDecorations(editor.document, constants);
        }
    });

    // Optionale Informationsnachricht nach dem Start der Erweiterung
    vscode.window.showInformationMessage('Erweiterung wurde nach dem Start aktiviert.');
}

/**
 * Diese Funktion wird aufgerufen, wenn die Erweiterung deaktiviert wird.
 * Sie bereinigt Ressourcen und entfernt Dekorationen.
 */
export function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
    // Entferne die Dekorationstypen, um Ressourcen freizugeben
    if (definedConstantDecoration) {
        definedConstantDecoration.dispose();
    }
    if (undefinedConstantDecoration) {
        undefinedConstantDecoration.dispose();
    }
}
