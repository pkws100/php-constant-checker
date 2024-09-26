"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
// Diagnose-Sammlung für unsere Erweiterung
let diagnosticCollection;
let definedConstantDecoration;
let undefinedConstantDecoration;
// Liste der PHP-Build-In-Konstanten, die nicht als undefiniert markiert werden sollen //
/*
const phpBuiltInConstants = [
    'E_ERROR', 'E_WARNING', 'E_PARSE', 'E_NOTICE', 'E_CORE_ERROR', 'E_CORE_WARNING',
    'E_COMPILE_ERROR', 'E_COMPILE_WARNING', 'E_USER_ERROR', 'E_USER_WARNING',
    'E_USER_NOTICE', 'E_STRICT', 'E_RECOVERABLE_ERROR', 'E_DEPRECATED',
    'E_USER_DEPRECATED', 'E_ALL', 'PHP_VERSION', 'PHP_OS', 'PHP_EOL', 'PHP_INT_MAX',
    'PHP_INT_MIN', 'PHP_FLOAT_MAX', 'PHP_FLOAT_MIN', 'PHP_SAPI', '_SERVER', '_POST',
    '_GET', '_FILES', '_COOKIE', '_SESSION', '_REQUEST', '_ENV', 'REQUEST_METHOD'
];*/
// Definieren der Dekorationstypen für definierte und undefinierte Konstanten
function createDecorations() {
    const config = vscode.workspace.getConfiguration('phpConstantChecker');
    const definedDecorationSettings = config.get('definedConstantDecoration', {
        textDecoration: 'underline',
        color: 'green',
        fontWeight: 'bold'
    });
    const undefinedDecorationSettings = config.get('undefinedConstantDecoration', {
        textDecoration: 'underline',
        color: 'red',
        fontWeight: 'bold'
    });
    // Vorhandene Dekorationen entsorgen
    if (definedConstantDecoration) {
        definedConstantDecoration.dispose();
    }
    if (undefinedConstantDecoration) {
        undefinedConstantDecoration.dispose();
    }
    definedConstantDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: definedDecorationSettings.textDecoration,
        color: definedDecorationSettings.color,
        fontWeight: definedDecorationSettings.fontWeight
    });
    undefinedConstantDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: undefinedDecorationSettings.textDecoration,
        color: undefinedDecorationSettings.color,
        fontWeight: undefinedDecorationSettings.fontWeight
    });
}
/**
 * Lädt alle Konstanten aus der angegebenen Datei, die mit define_ex definiert wurden.
 *
 * @param filePath - Der Pfad zur Datei, aus der die Konstanten geladen werden sollen.
 * @returns Ein Array von Konstantennamen als Strings.
 */
function loadConstants(filePath) {
    const constants = [];
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split(/\r?\n/);
        // Regex zum Finden von Konstantendefinitionen mit define_ex
        const regex = /define_ex\s*\(\s*['"]([A-Za-z0-9_]+)['"]/;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = regex.exec(line);
            if (match) {
                constants.push({
                    name: match[1],
                    line: i + 1 // Zeilennummer (1-basiert)
                });
            }
        }
    }
    catch (error) {
        vscode.window.showErrorMessage(`Fehler beim Laden der Konstanten aus ${filePath}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
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
function maskCommentsAndStrings(text) {
    return text.replace(/\/\/.*|\/\*[\s\S]*?\*\/|#.*|(['"`])(?:\\.|[^\\])*?\1/g, (match) => ' '.repeat(match.length));
}
/**
 * Wendet Dekorationen auf die definierten und undefinierten Konstanten im Dokument an.
 *
 * @param document - Das aktuelle Textdokument.
 * @param constants - Ein Array von definierten Konstanten mit Informationen.
 */
function applyDecorations(document, constants, excludedConstants) {
    // Finde den aktiven Editor für das Dokument
    const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
    if (!editor) {
        return;
    }
    const text = document.getText();
    // Aktualisierte Regex zum Finden von PHP-Codeblöcken
    const phpTagRegex = /<\?php[\s\S]*?(?:\?>|$)|<\?=([\s\S]*?)(?:\?>|$)/g;
    let phpMatch;
    // Arrays zum Speichern der Bereiche für definierte und undefinierte Konstanten
    const definedRanges = [];
    const undefinedRanges = [];
    // Erstellen einer Map für schnellen Zugriff
    const constantMap = new Map();
    constants.forEach(constant => {
        constantMap.set(constant.name, constant);
    });
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
            }
            else if (precedingChars.endsWith('::')) {
                // Statischer Zugriff (::), ausschließen
                exclude = true;
            }
            else if (precedingChars.endsWith('->')) {
                // Objektzugriff (->), ausschließen
                exclude = true;
            }
            if (exclude) {
                continue;
            }
            // Ignoriere Konstanten, die mit 'TXT_CHAR' oder 'TEXT' beginnen
            if (constant.startsWith('TXT_CHAR') || constant.startsWith('TEXT')) {
                continue;
            }
            // PHP-Build-In-Konstanten ignorieren
            if (excludedConstants.includes(constant)) {
                continue;
            }
            const startPos = document.positionAt(constantStartIndex);
            const endPos = document.positionAt(constantEndIndex);
            const range = new vscode.Range(startPos, endPos);
            // Überprüfe, ob die Konstante definiert ist, und füge sie der entsprechenden Liste hinzu
            const constantInfo = constantMap.get(constant);
            if (constantInfo) {
                definedRanges.push(range);
            }
            else {
                undefinedRanges.push(range);
            }
        }
    }
    // Anwenden der Dekorationen auf die gefundenen Bereiche
    editor.setDecorations(definedConstantDecoration, definedRanges);
    editor.setDecorations(undefinedConstantDecoration, undefinedRanges);
}
/**
 * HoverProvider für Konstanten
 */
class ConstantHoverProvider {
    constantMap;
    constantFilePath;
    constructor(constants, constantFilePath) {
        this.constantMap = new Map();
        constants.forEach(constant => {
            this.constantMap.set(constant.name, constant);
        });
        this.constantFilePath = constantFilePath;
    }
    updateConstants(newConstants) {
        this.constantMap.clear();
        newConstants.forEach(constant => {
            this.constantMap.set(constant.name, constant);
        });
    }
    provideHover(document, position, token) {
        const range = document.getWordRangeAtPosition(position, /\b[A-Z][A-Z0-9_]*\b/);
        if (range) {
            const word = document.getText(range);
            const constantInfo = this.constantMap.get(word);
            if (constantInfo) {
                const markdownString = new vscode.MarkdownString(`Die Konstante \`${word}\` ist definiert in [${this.constantFilePath}:${constantInfo.line}](${vscode.Uri.file(this.constantFilePath).with({ fragment: `L${constantInfo.line}` })}).`);
                markdownString.isTrusted = true; // Erlaubt Links
                return new vscode.Hover(markdownString, range);
            }
        }
        return null;
    }
}
/**
 * Diese Funktion wird aufgerufen, wenn die Erweiterung aktiviert wird.
 * Sie initialisiert die Erweiterung und registriert die erforderlichen Event-Listener.
 *
 * @param context - Der Kontext der Erweiterung.
 */
function activate(context) {
    // Erstellen einer eigenen DiagnosticCollection für unsere Erweiterung
    diagnosticCollection = vscode.languages.createDiagnosticCollection('phpConstantChecker');
    context.subscriptions.push(diagnosticCollection);
    // Standardpfad zur Konstantendatei (kann über die Einstellungen überschrieben werden)
    //let filePath = vscode.workspace.getConfiguration('phpConstantChecker').get('constantFile', 'C:/inetpub/pkws_wwwroot/Firmware/SCR/constant.php');
    // Einstellungen laden
    const config = vscode.workspace.getConfiguration('phpConstantChecker');
    let filePath = config.get('constantFile', 'C:/inetpub/pkws_wwwroot/Firmware/SCR/constant.php');
    let excludedConstants = config.get('excludedConstants', []);
    // Laden der Konstanten aus der angegebenen Datei
    let constants = loadConstants(filePath);
    // Erstellen Sie eine Instanz des HoverProviders
    const hoverProvider = new ConstantHoverProvider(constants, filePath);
    // Registrieren Sie den HoverProvider für PHP-Dateien
    context.subscriptions.push(vscode.languages.registerHoverProvider('php', hoverProvider));
    // Dekorationen erstellen
    createDecorations();
    // Watcher für die constant.php-Datei
    const constantFileWatcher = vscode.workspace.createFileSystemWatcher(filePath);
    context.subscriptions.push(constantFileWatcher);
    constantFileWatcher.onDidChange(() => {
        // Konstanten neu laden
        constants = loadConstants(filePath);
        // Aktualisieren Sie den HoverProvider
        hoverProvider.updateConstants(constants);
        // Aktualisieren Sie auch die Dekorationen
        vscode.workspace.textDocuments.forEach(document => {
            if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
                applyDecorations(document, constants, excludedConstants);
            }
        });
    });
    // Event-Listener für das Öffnen von Textdokumenten
    vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
            applyDecorations(document, constants, excludedConstants);
        }
    });
    // Event-Listener für Änderungen an Textdokumenten
    vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;
        if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
            applyDecorations(document, constants, excludedConstants);
        }
    });
    // Anwenden der Dekorationen auf alle geöffneten PHP-Dokumente beim Start der Erweiterung
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
            applyDecorations(document, constants, excludedConstants);
        }
    });
    // Anwenden der Dekorationen auf alle sichtbaren Editoren beim Start der Erweiterung
    vscode.window.visibleTextEditors.forEach(editor => {
        const document = editor.document;
        if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
            applyDecorations(document, constants, excludedConstants);
        }
    });
    // Event-Listener für den Wechsel des aktiven Editors
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && (editor.document.languageId === 'php' || editor.document.fileName.endsWith('.php'))) {
            applyDecorations(editor.document, constants, excludedConstants);
        }
    });
    // Event-Listener für Änderungen an den Einstellungen
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('phpConstantChecker')) {
            // Aktualisieren Sie die Einstellungen
            filePath = config.get('constantFile', filePath);
            excludedConstants = config.get('excludedConstants', []);
            // Dekorationen neu erstellen
            createDecorations();
            // Konstanten neu laden
            constants = loadConstants(filePath);
            // Aktualisieren Sie den HoverProvider
            hoverProvider.updateConstants(constants);
            // Aktualisieren Sie die Dekorationen
            vscode.workspace.textDocuments.forEach(document => {
                if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
                    applyDecorations(document, constants, excludedConstants);
                }
            });
        }
    });
    // Optionale Informationsnachricht nach dem Start der Erweiterung
    vscode.window.showInformationMessage('Erweiterung wurde nach dem Start aktiviert.');
}
/**
 * Diese Funktion wird aufgerufen, wenn die Erweiterung deaktiviert wird.
 * Sie bereinigt Ressourcen und entfernt Dekorationen.
 */
function deactivate() {
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
//# sourceMappingURL=extension.js.map