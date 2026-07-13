/* ════════════════════════════════════════════════════════
   TUT.JS — Tutorial content (EN + ZH)
   Each section has: id, heading, content (HTML string)
   Rendered dynamically by renderTutorial() in app.js.
════════════════════════════════════════════════════════ */

const TUTORIAL = {

en: {
  title: 'Exegetical Phrasing Editor — Tutorial',
  sections: [
    {
      id: 'intro',
      heading: 'Introduction',
      content: `
        <p>Exegetical phrasing is a study method in which a biblical passage is broken into its grammatical and syntactical units, arranged visually to show how clauses and phrases relate to one another. The goal is not simply to outline a passage but to see its internal logic — which propositions are primary, which are subordinate, and how the author builds his argument or narrative.</p>
        <p>The Exegetical Phrasing Editor is a free, browser-based tool designed specifically for this work. It provides a structured canvas for laying out original-language texts alongside a translation, with indentation, line labeling, comments, and Bible reference access built in. Everything stays in your browser — no account, no server, no subscription.</p>
      `
    },
    {
      id: 'screen1',
      heading: 'Part 1: Getting Started',
      content: `
        <h3>Opening the App</h3>
        <p>Navigate to the app in any modern browser. You will land on <strong>Screen 1</strong>, the language selection screen. This is where you tell the app what kind of text you will be working with, because the choice affects the canvas layout and text direction.</p>
        <p>Three options are available:</p>
        <ul>
          <li><strong>Hebrew</strong> — right-to-left orientation with two columns (Original + Translation). Use this for Old Testament study.</li>
          <li><strong>Greek</strong> — left-to-right with the same two-column layout. Use this for New Testament study.</li>
          <li><strong>Other Language</strong> — a single-column canvas for translations or non-original-language work. You can load NET, CUV Simplified, CUV Traditional, Vulgate, or paste any text.</li>
        </ul>
        <p>On the right side of Screen 1 you will also see a <strong>Recent Projects</strong> panel. Previously saved sessions appear here and can be opened with a single click. Each project card also has a <strong>trash icon</strong> — click it to delete that project (a confirmation dialog will appear). A <strong>Load JSON</strong> button allows you to load a saved file from your computer.</p>
      `
    },
    {
      id: 'screen2',
      heading: 'Part 2: Choosing a Passage',
      content: `
        <p>After selecting a language, you move to <strong>Screen 2</strong>, the passage entry screen. You have two ways to bring text into the editor.</p>
        <h3>Option A: Paste Text</h3>
        <p>Select the <strong>Paste text</strong> tab. Paste your passage into the text area. If each line begins with a verse number (for example, <code>1 In the beginning…</code>), the editor will detect those numbers automatically and assign them to the correct rows when you confirm.</p>
        <p>In the <strong>Translation / Version</strong> field above the text area, type the name of the version or edition you are using — for example, <em>NA28</em>, <em>BHS</em>, or <em>ESV</em>. This label will appear as the column header in the editor and on exported PDFs.</p>
        <h3>Option B: Choose from Bible</h3>
        <p>Select the <strong>Choose from Bible</strong> tab. Use the dropdowns to choose Corpus, Book, Chapter, Verses, and Version. A preview of the selected passage appears before you confirm.</p>
        <p>Available offline versions include SBLGNT, Byzantine Text, LXX, WLC, CUV Simplified, CUV Traditional, and Vulgate. The <strong>NET Bible</strong> requires an internet connection.</p>
        <p>Click <strong>Confirm and Open Editor</strong> to load the passage. You may also click <strong>Skip — empty editor</strong> to open a blank canvas.</p>
      `
    },
    {
      id: 'canvas',
      heading: 'Part 3: The Editor Canvas',
      content: `
        <h3>Layout</h3>
        <p>The canvas has four columns:</p>
        <table>
          <tr><th>Column</th><th>Purpose</th></tr>
          <tr><td><strong>Verse</strong></td><td>The verse number. Rows without a number inherit the verse above.</td></tr>
          <tr><td><strong>Line</strong></td><td>Auto-computed label (1a, 1b, 2a…) identifying each phrasing unit.</td></tr>
          <tr><td><strong>Original</strong></td><td>The original language or source text.</td></tr>
          <tr><td><strong>Translation</strong></td><td>Your working translation. Hidden in single-column sessions.</td></tr>
        </table>
        <p>At the top, fill in the <strong>verse reference</strong> (e.g. <em>Romans 1:1–7</em>) and the <strong>version label</strong> (e.g. <em>NA28</em>). These appear in the header of exported PDFs.</p>
        <h3>Core Workflow</h3>
        <ol>
          <li><strong>Enter text</strong> in the Original column — one clause or phrase per row.</li>
          <li><strong>Split rows</strong> with <kbd>Enter</kbd> to break at the cursor position.</li>
          <li><strong>Indent</strong> subordinate clauses with <kbd>Tab</kbd>; outdent with <kbd>Shift+Tab</kbd>.</li>
          <li><strong>Add a translation</strong> in the Translation column alongside each phrase. Grammatical labels like <em>"purpose clause"</em> or <em>"causal — because"</em> are perfectly valid.</li>
          <li><strong>Label verses</strong> in the Verse column. Leave blank for continuation rows — line labels update automatically.</li>
        </ol>
        <h3>Indentation Principles</h3>
        <p>Indentation is the visual grammar of the phrasing. As a general guide:</p>
        <ul>
          <li>Main clauses and primary assertions — flush left</li>
          <li>Subordinate clauses (purpose, result, causal, concessive) — indented one level</li>
          <li>Further qualifications — indented two levels</li>
        </ul>
        <p>Pressing <kbd>Backspace</kbd> at the very beginning of an already-indented line will also outdent it.</p>
        <h3>Row Operations</h3>
        <ul>
          <li><kbd>Ctrl + +</kbd> — add a blank row below without splitting</li>
          <li><kbd>Ctrl + −</kbd> — merge the current row up into the row above</li>
          <li><kbd>↑</kbd> / <kbd>↓</kbd> — navigate between rows</li>
        </ul>
        <h3>Text Formatting</h3>
        <p>All formatting applies to selected text within a cell: <strong>Bold</strong> (<kbd>Ctrl+B</kbd>), <em>Italic</em> (<kbd>Ctrl+I</kbd>), Superscript (<kbd>Ctrl+.</kbd>), Highlight, Font size, and Text color.</p>
        <h3>Comments</h3>
        <p>Click the speech bubble icon at the right edge of any row to open a floating comment card. Cards can be dragged, resized, and typed into freely. In exported PDFs, comment content appears as footnotes keyed to the row's line label (e.g. <em>1a</em>, <em>3b</em>).</p>
        <h3>Undo and Redo</h3>
        <p><kbd>Ctrl+Z</kbd> undoes both text edits and structural operations (splits, merges, indents). <kbd>Ctrl+Y</kbd> redoes any undone operation.</p>
      `
    },
    {
      id: 'toolbar',
      heading: 'Part 4: The Toolbar',
      content: `
        <p>The toolbar at the top of the editor canvas gives you access to all major functions.</p>
        <p>On the <strong>left</strong>: undo/redo, text formatting tools (bold, italic, strikethrough, superscript, highlight, size, text color), indent/outdent buttons, and the <strong>Phrasing / Diagram View toggle</strong> (<kbd>Alt+T</kbd>) — switches the canvas between the row-based Phrasing View and the block-based Diagram View. Both show the same underlying document. In Diagram View, drag a block left or right to change its indentation, or hold <kbd>Shift</kbd> while dragging from one block to another to draw a curved connecting line between them (it snaps to the top or bottom edge of each block). A small <strong>+</strong> handle on the left edge of every block draws a different kind of line instead — a right-angle line for tracing clause logic, drawn behind the text so it never obscures it. Either drag from the <strong>+</strong> to a target block, or just click it once to arm it, move the cursor freely, and click the target block to finish (click the same handle again, click empty space, or press <kbd>Esc</kbd> to cancel). Click any connecting line to select it and open a small popup for changing its line style (solid/dotted), the start and end endpoints (each independently none/arrow/dot), weight, color, or deleting it — <kbd>Backspace</kbd> or <kbd>Delete</kbd> also deletes a selected line. Two zoom buttons appear in the toolbar while in Diagram View (also <kbd>Ctrl++</kbd>/<kbd>Ctrl+-</kbd>); click the percentage label or press <kbd>Ctrl+0</kbd> to reset to 100%. For Greek/Hebrew sessions, the Translation text appears directly below each block and can be edited directly — changes show up in Phrasing View too.</p>
        <p>On the <strong>right</strong>:</p>
        <ul>
          <li>The <strong>session badge</strong> (e.g. <em>Greek Session</em>) shows your current language mode.</li>
          <li><strong>Projects</strong> (<kbd>Alt+1</kbd>) — opens the Projects sidebar. This shortcut also works on Screen 1.</li>
          <li><strong>Bible Module</strong> (<kbd>Alt+2</kbd>) — opens the Bible Module sidebar.</li>
          <li><strong>Restart</strong> (<kbd>Ctrl+Shift+R</kbd>) — clears the canvas and returns to Screen 1.</li>
          <li><strong>Help</strong> (<kbd>Ctrl+H</kbd>) — opens this help panel.</li>
          <li><strong>Settings</strong> (<kbd>Ctrl+,</kbd>) — opens the color theme editor.</li>
          <li><strong>EN / 简体 toggle</strong> (<kbd>Ctrl+Space</kbd>) — switches the interface language.</li>
        </ul>
      `
    },
    {
      id: 'projects',
      heading: 'Part 5: The Projects Panel',
      content: `
        <p>Open with <kbd>Alt+1</kbd> or the folder icon in the toolbar. The panel slides in from the left.</p>
        <h3>Saving</h3>
        <p>Press <kbd>Ctrl+S</kbd> to save your project for the first time. If your verse reference is filled in, the app uses that as the project name.</p>
        <p>After the first save, the project <strong>autosaves automatically</strong> on every change — splits, indents, text edits, and comment updates all trigger a silent background save. You will see <em>"Auto-saved · HH:MM"</em> flash briefly in the bottom-right corner of the screen, then return to <em>"Ready"</em>. You do not need to keep pressing <kbd>Ctrl+S</kbd>.</p>
        <p>Projects are saved inside your browser's local storage.</p>
        <blockquote><strong>Important:</strong> Local storage can be cleared when you clear your browser data. Export your work to JSON regularly as a backup.</blockquote>
        <h3>Opening and Deleting</h3>
        <p>Click any project card to open it. Each card has a trash icon for deletion — a confirmation dialog will appear before anything is removed. Deleted projects cannot be recovered. You can also delete projects from the <strong>Recent Projects</strong> column on Screen 1 using the same trash icon.</p>
        <h3>Exporting All Projects</h3>
        <p>Click <strong>Export all projects</strong> at the bottom of the panel, then choose <strong>All projects as PDF</strong> or <strong>All projects as JSON</strong>. All saved projects are bundled into a single ZIP file and downloaded to your computer.</p>
      `
    },
    {
      id: 'bible',
      heading: 'Part 6: The Bible Module',
      content: `
        <p>Open with <kbd>Alt+2</kbd> or the book icon in the toolbar. The panel slides in from the right.</p>
        <h3>Selecting a Passage</h3>
        <p>Click <strong>Select passage…</strong> to open the book picker. Click a book, then a chapter, then a verse. Use <kbd>Ctrl+Shift+[</kbd> and <kbd>Ctrl+Shift+]</kbd> to move between chapters.</p>
        <h3>Available Versions</h3>
        <p><strong>Offline:</strong> SBLGNT, Byzantine Text, LXX, WLC, CUV Simplified, CUV Traditional, Vulgate.<br>
        <strong>Online (requires internet):</strong> NET Bible.</p>
        <p>When a new tab is opened, the default version is <strong>CUV Simplified</strong> if the interface is in Chinese, <strong>NET</strong> if online and in English, or <strong>SBLGNT</strong> if offline.</p>
        <h3>NET Bible Footnotes</h3>
        <p>Footnote markers appear as small gold superscript numbers inline in the verse text. <strong>Hover</strong> over a marker to see a tooltip. <strong>Click</strong> a marker (outside split pane mode) to open a persistent footnote box at the bottom of the pane. Click ✕ or anywhere else in the pane to close it. In split pane mode, clicking is disabled — hover still works.</p>
        <h3>Tabs</h3>
        <p>Each pane supports up to five tabs. Click <strong>+</strong> to add a tab. Click an active tab to switch versions. Tabs can be dragged between panes.</p>
        <h3>Split Pane</h3>
        <p>Click the split icon or press <kbd>Ctrl+\</kbd> to open a second pane below. Compare two passages or two versions side by side.</p>
        <h3>Scroll Sync</h3>
        <p>Click the lock icon in the panel header to sync scrolling between the top and bottom panes.</p>
        <h3>Pinning the Panel</h3>
        <p>Click the pin icon or press <kbd>Ctrl+Shift+\</kbd> to dock the Bible Module to the right side of the canvas permanently. Drag the divider to resize. Press the same hotkey or click the pin icon again to unpin.</p>
      `
    },
    {
      id: 'exporting',
      heading: 'Part 7: Exporting',
      content: `
        <h3>Export as PDF</h3>
        <p>Click <strong>Export ▾</strong> in the bottom bar and choose <em>Export as PDF</em>, or press <kbd>Ctrl+Shift+E</kbd>. The PDF includes your verse reference, version label, all verse numbers and line labels, original and translation text with indentation, and footnotes from comment cards.</p>
        <p>Orientation is landscape for two-column sessions (Hebrew/Greek) and portrait for single-column sessions.</p>
        <h3>Export as JSON</h3>
        <p>Choose <em>Export as JSON</em> to save a complete snapshot of your session — rows, indentation, formatting, comments, and settings. Load it back any time with <kbd>Ctrl+O</kbd> or the Load JSON button. JSON is the recommended format for long-term backup and sharing.</p>
      `
    },
    {
      id: 'settings',
      heading: 'Part 8: Settings',
      content: `
        <h3>Color Theme</h3>
        <p>Open Settings with <kbd>Ctrl+,</kbd> or the gear icon. Customize six color values: Background, Accent, Ink, Signature, Label, and Active. Click <strong>Reset to default</strong> to restore the original palette.</p>
        <h3>Clear Bible Cache</h3>
        <p>If you experience loading issues with the Bible Module, click <strong>Clear Bible Cache</strong> in Settings. Offline versions will be re-downloaded on next access.</p>
        <h3>UI Language</h3>
        <p>Click the <strong>EN / 简体</strong> pill in the toolbar or press <kbd>Ctrl+Space</kbd> to toggle between English and Simplified Chinese. Your preference is saved across sessions.</p>
      `
    },
    {
      id: 'brackets',
      heading: 'Part 9: Bracket Annotations',
      content: `
        <p>Brackets let you annotate structural relationships — chiasm, parallelism, inclusio, discourse units — directly on the Diagram View canvas. Each bracket is a vertical line with serifs that spans one or more rows, with an optional text label.</p>
        <h3>Switching to Diagram View</h3>
        <p>Brackets only appear in <strong>Diagram View</strong>. Click the <strong>Diagram</strong> button in the toolbar (or press <kbd>Alt+T</kbd>) to switch. Your rows will be rendered as indented blocks with connectors.</p>
        <h3>Creating a Bracket</h3>
        <ol>
          <li>Hold <kbd>Shift</kbd>. A small circular pip dot appears on the right edge of each row block.</li>
          <li>While still holding <kbd>Shift</kbd>, click the pip on the <strong>first row</strong> of the span you want to bracket. The status bar shows <em>"Bracket started — Shift+click another row handle to complete."</em></li>
          <li>Click the pip on the <strong>last row</strong> of the span. The bracket is drawn immediately.</li>
        </ol>
        <p>Press <kbd>Escape</kbd> at any point to cancel the pending bracket.</p>
        <h3>Label Editing</h3>
        <p>Every bracket has a text label zone to its right. When a bracket is first created the label shows faint placeholder text. Click directly on it — a text cursor appears and you can type immediately, just like editing any other text in the editor. Press <kbd>Enter</kbd> or click elsewhere to confirm. The label width adjusts automatically.</p>
        <h3>Editing Color, Thickness and Deleting</h3>
        <p>Click on the bracket's vertical line (or its label) to select it — a gold outline appears and an edit popup opens. From the popup you can:</p>
        <ul>
          <li>Change the <strong>color</strong> using the color picker</li>
          <li>Set the <strong>thickness</strong> to thin, medium, or thick</li>
          <li><strong>Delete</strong> the bracket with the trash button</li>
        </ul>
        <h3>Resizing the Span</h3>
        <p>To change which rows a bracket spans, drag either <strong>serif</strong> (the horizontal bar at the top or bottom of the bracket line). Dragging snaps to the nearest row. The bracket resizes live as you drag.</p>
        <h3>Repositioning the Label</h3>
        <p>Drag the label text <strong>up or down</strong> to reposition it along the bracket's vertical span. The small tick mark moves with it. The label is clamped inside the bracket's top and bottom serifs.</p>
        <h3>Nested Brackets</h3>
        <p>You can create multiple brackets. The editor automatically assigns lanes: inner brackets (whose span is fully contained within another) are placed <strong>closer to the blocks</strong>, while outer brackets step further right. This gives a natural chiasm or concentric structure appearance without any manual adjustment.</p>
        <h3>Undo / Redo</h3>
        <p>All bracket operations — create, delete, resize, recolor, relabel, reposition — are fully undoable with <kbd>Ctrl+Z</kbd> and redoable with <kbd>Ctrl+Y</kbd>.</p>
        <h3>Saving</h3>
        <p>Bracket data is saved automatically with your project. It appears in JSON exports and in all PDF diagram exports.</p>
      `
    },
    {
      id: 'slides',
      heading: 'Part 10: Slides & Presenter Mode',
      content: `
        <p>The Slides system lets you build a presentation deck from your exegetical work — selecting specific rows, toggling visibility of elements, adding text boxes, and presenting to a class via a projector window.</p>
        <h3>Opening the Slides View</h3>
        <p>Click <strong>Slides</strong> in the toolbar (or press <kbd>Alt+P</kbd>). The interface has three columns: a <strong>slide thumbnail list</strong> on the left, a <strong>16:9 slide canvas</strong> in the center, and a <strong>properties panel</strong> on the right.</p>
        <h3>Adding Slides</h3>
        <ul>
          <li><strong>Add Blank Slide</strong> — creates an empty white slide with no passage content.</li>
          <li><strong>Add Content Slide</strong> — creates a slide pre-loaded with all rows from the current session.</li>
        </ul>
        <p>Click any thumbnail to select it. Drag thumbnails to reorder them. Click the <strong>⋯</strong> button on a thumbnail to duplicate or delete it.</p>
        <h3>Choosing Rows</h3>
        <p>In the right panel under <strong>Verse</strong>, check the rows you want to appear on this slide. Only those rows will be shown — you can show a single verse, a sub-section, or the whole passage. Click <strong>All</strong> or <strong>None</strong> to select or clear all at once.</p>
        <h3>View Mode</h3>
        <p>Each slide can show its passage in either <strong>Phrasing</strong> mode (the table layout with indentation) or <strong>Diagram</strong> mode (the block-and-connector layout). Toggle between them using the Phrasing / Diagram buttons in the right panel.</p>
        <h3>Visibility Toggles</h3>
        <p>Under <strong>Elements</strong> in the right panel, check or uncheck what appears on this slide:</p>
        <ul>
          <li><strong>Indentation</strong> — show or hide the indent levels of blocks</li>
          <li><strong>Translation lines</strong> — show or hide the translation row beneath each block</li>
          <li><strong>Comments</strong> — show comment text as floating boxes on the slide</li>
          <li><strong>Connectors</strong> — show or hide the SVG connector lines (Diagram mode)</li>
          <li><strong>Brackets</strong> — show or hide bracket annotations (Diagram mode)</li>
          <li><strong>Labels</strong> — show or hide floating diagram labels (Diagram mode)</li>
        </ul>
        <h3>Refreshing the Slide</h3>
        <p>The slide canvas does not update live while you change settings — this prevents lag. Click <strong>Refresh</strong> in the toolbar to apply your current row selection, view mode, and visibility settings to the canvas. The slide also refreshes automatically when you click its thumbnail.</p>
        <h3>Text Boxes</h3>
        <p>Click <strong>Add Text Box</strong> in the toolbar to place a text box on the slide. Then:</p>
        <ul>
          <li><strong>Single-click</strong> a text box to select it (gold outline + resize handles appear)</li>
          <li><strong>Drag</strong> a selected text box to move it</li>
          <li><strong>Drag the corner or edge handles</strong> to resize it</li>
          <li><strong>Double-click</strong> to enter text editing mode — type directly, press <kbd>Escape</kbd> to finish</li>
          <li><strong>Right-click</strong> for options: Bring to Front, Send to Back, Delete</li>
        </ul>
        <h3>Floating Labels and Comment Boxes</h3>
        <p>When you check <strong>Labels</strong> or <strong>Comments</strong> in the Elements panel and click Refresh, diagram floating labels and comment text appear as independent draggable boxes on the slide. Move them anywhere by dragging. Their positions are remembered per slide.</p>
        <h3>Speaker Notes</h3>
        <p>Type your personal speaking notes in the <strong>Speaker Notes</strong> area at the bottom of the right panel. Notes are only visible to you in the presenter dashboard — they never appear on the projector screen.</p>
        <h3>Presenter Mode</h3>
        <p>Click the <strong>Present</strong> button to launch a separate projector window. The main screen switches to the <strong>presenter dashboard</strong>:</p>
        <ul>
          <li><strong>Left</strong> — live preview of the current slide</li>
          <li><strong>Right</strong> — your speaker notes (drag the divider to resize)</li>
          <li><strong>Bottom bar</strong> — ◀ Previous | Slide N of M | Next ▶ | End Presentation</li>
        </ul>
        <p>Use the <kbd>←</kbd> / <kbd>→</kbd> arrow keys or the on-screen buttons to advance slides. The projector window updates instantly on each advance. Press <kbd>Escape</kbd> or click <strong>End Presentation</strong> to return to the slide editor.</p>
        <p>Drag the projector window to your external display and press <kbd>F11</kbd> to fullscreen it before presenting.</p>
        <h3>Export Slides as PDF</h3>
        <p>Click <strong>Export Slides PDF</strong> in the toolbar. Each slide is rendered at full resolution and saved as one landscape page per slide. Speaker notes are not included in the PDF.</p>
        <h3>Undo / Redo</h3>
        <p>All slide operations — adding, deleting, reordering slides; moving and resizing text boxes; changing visibility — are fully undoable with <kbd>Ctrl+Z</kbd> and redoable with <kbd>Ctrl+Y</kbd>.</p>
        <h3>Saving</h3>
        <p>The slide deck is saved automatically as part of your project JSON. It is included in all project exports and loads back when you reopen the project.</p>
      `
    },
    {
      id: 'updates',
      heading: 'Part 11: Updates',
      content: `
        <p>When an update is deployed while you have the app open, a banner slides up from the bottom: <em>"A new version is available."</em></p>
        <ul>
          <li>Click <strong>Update</strong> to apply immediately. The page reloads and a confirmation toast appears.</li>
          <li>Click <strong>✕</strong> to dismiss. A warning note appears, and the banner collapses to a small pill you can click to re-expand.</li>
        </ul>
        <p>If you open the app in a fresh tab after an update, it applies automatically and a brief <em>"You're on the latest version"</em> toast appears.</p>
      `
    }
  ]
},

zh: {
  title: '经文分析编辑器——使用教程',
  sections: [
    {
      id: 'intro',
      heading: '简介',
      content: `
        <p>经文分句（Exegetical Phrasing）是一种圣经研究方法，将经文段落拆解为语法和句法单位，通过视觉化排列展示子句和短语之间的关系。其目标不仅是对经文进行大纲式划分，更是呈现经文的内在逻辑——哪些命题是主干，哪些是从属，以及作者如何建构其论证或叙述。</p>
        <p>经文分析编辑器是一款专为此研究方法设计的免费浏览器工具。它提供结构化画布，用于排列原文与译文，内置缩进、行号标记、批注和圣经参考查阅功能。所有数据均保存在您的浏览器中，无需账户、服务器或订阅。</p>
      `
    },
    {
      id: 'screen1',
      heading: '第一部分：开始使用',
      content: `
        <h3>打开应用</h3>
        <p>在任意现代浏览器中访问该应用，您将进入<strong>界面一</strong>（语言选择界面）。在这里，您需要告知应用您将使用哪种语言的文本，因为这将影响画布版面和文字方向。</p>
        <p>有三个选项：</p>
        <ul>
          <li><strong>希伯来文</strong>——从右到左排列，提供"原文"与"译文"两列。适用于旧约研究。</li>
          <li><strong>希腊文</strong>——从左到右排列，同样提供双列版面。适用于新约研究。</li>
          <li><strong>其他语言</strong>——单列画布，用于使用译本或非原文语言研究。支持载入和合本简体、繁体、NET圣经、武加大等版本，或粘贴任意文本。</li>
        </ul>
        <p>界面一右侧还有<strong>最近项目</strong>面板，显示您之前保存的工作，点击即可重新打开。每个项目卡片右侧还有<strong>删除图标</strong>——点击后会弹出确认对话框，确认后删除该项目。<strong>载入JSON</strong>按钮可从电脑加载已保存的文件。</p>
      `
    },
    {
      id: 'screen2',
      heading: '第二部分：选择经文段落',
      content: `
        <p>选择语言后，进入<strong>界面二</strong>（段落输入界面）。有两种方式将文本导入编辑器。</p>
        <h3>方式A：粘贴文本</h3>
        <p>选择<strong>粘贴文字</strong>标签页，将经文粘贴到文本区域。若每行以节码开头（如 <code>1 太初…</code>），编辑器将自动识别并在确认后分配至对应行。</p>
        <p>在上方<strong>译本/版本</strong>栏中输入版本名称，如<em>NA28</em>、<em>BHS</em>或<em>ESV</em>。该标签将出现为编辑器列标题，并显示在导出的PDF中。</p>
        <h3>方式B：从圣经选取</h3>
        <p>选择<strong>从圣经选取</strong>标签页，使用下拉菜单选择经典（旧约/新约）、书卷、章、节范围和版本。确认前会显示所选段落的预览。</p>
        <p>可离线使用的版本包括SBLGNT、拜占庭文本、七十士译本、WLC、和合本简体、和合本繁体和武加大。<strong>NET圣经</strong>需要网络连接。</p>
        <p>点击<strong>确认并开启编辑器</strong>加载段落；也可点击<strong>跳过——空白编辑器</strong>直接打开空白画布。</p>
      `
    },
    {
      id: 'canvas',
      heading: '第三部分：编辑器画布',
      content: `
        <h3>版面说明</h3>
        <p>画布共有四列：</p>
        <table>
          <tr><th>列</th><th>用途</th></tr>
          <tr><td><strong>节</strong></td><td>节码。未填写节码的行继承上方行的节码。</td></tr>
          <tr><td><strong>行号</strong></td><td>自动生成的标签（如1a、1b、2a），标识每个分句单元。</td></tr>
          <tr><td><strong>原文</strong></td><td>原文或来源文本。</td></tr>
          <tr><td><strong>译文</strong></td><td>您的工作译文。单列模式下此列隐藏。</td></tr>
        </table>
        <p>画布顶部有两个输入框：<strong>经文参考</strong>（如<em>罗马书1:1–7</em>）和<strong>版本标签</strong>（如<em>NA28</em>）。这些内容将出现在导出PDF的标题中。</p>
        <h3>基本工作流程</h3>
        <ol>
          <li>在原文列中<strong>输入文本</strong>，每行一个短语或从句。</li>
          <li>按<kbd>Enter</kbd>在光标处<strong>分割行</strong>。</li>
          <li>按<kbd>Tab</kbd><strong>增加缩进</strong>标记从属关系；按<kbd>Shift+Tab</kbd>减少缩进。</li>
          <li>在译文列填写<strong>对应译文</strong>。语法注释如"目的从句"或"原因——因为"均可填写。</li>
          <li>在节码列填写<strong>节码</strong>，延续行留空，行号标签自动更新。</li>
        </ol>
        <h3>缩进原则</h3>
        <p>缩进是经文分句的视觉语法：</p>
        <ul>
          <li>主句和核心命题——顶格</li>
          <li>从属从句（目的、结果、原因、让步）——缩进一级</li>
          <li>进一步修饰——缩进两级</li>
        </ul>
        <p>在已缩进行的行首按<kbd>Backspace</kbd>也可减少缩进。</p>
        <h3>行操作</h3>
        <ul>
          <li><kbd>Ctrl + +</kbd>——在下方添加空行</li>
          <li><kbd>Ctrl + −</kbd>——向上合并当前行</li>
          <li><kbd>↑</kbd> / <kbd>↓</kbd>——在行间导航</li>
        </ul>
        <h3>文字格式</h3>
        <p>所有格式应用于单元格内的选中文字：<strong>粗体</strong>（<kbd>Ctrl+B</kbd>）、<em>斜体</em>（<kbd>Ctrl+I</kbd>）、上标（<kbd>Ctrl+.</kbd>）、高亮、字号和文字颜色。</p>
        <h3>批注</h3>
        <p>点击每行右侧的气泡图标，可打开浮动批注卡片，可拖动、调整大小并自由输入内容。导出PDF时，批注内容以脚注形式显示，并与行号标签（如<em>1a</em>、<em>3b</em>）关联。</p>
        <h3>撤销与重做</h3>
        <p><kbd>Ctrl+Z</kbd>撤销文字编辑和结构操作（分割、合并、缩进）；<kbd>Ctrl+Y</kbd>重做。</p>
      `
    },
    {
      id: 'toolbar',
      heading: '第四部分：工具栏',
      content: `
        <p>工具栏位于编辑器画布顶部。</p>
        <p><strong>左侧</strong>：撤销/重做、文字格式工具（粗体、斜体、删除线、上标、高亮、字号、文字颜色）、缩进按钮，以及<strong>分句/图示视图切换</strong>（<kbd>Alt+T</kbd>）——在以行为基础的分句视图与以方框为基础的图示视图之间切换画布显示方式。两者展示的是同一份文档。在图示视图中，左右拖动方框可调整其缩进；按住<kbd>Shift</kbd>键并从一个方框拖动到另一个方框，可绘制曲线连接线（连接点会自动吸附到方框的上边缘或下边缘）。方框左边缘的小型<strong>+</strong>手柄可绘制另一种直角连接线，用于追踪子句逻辑关系，该线绘制在文字下方，不会遮挡内容。可以从<strong>+</strong>拖动到目标方框，也可以单击一次将其激活，然后自由移动光标，再点击目标方框完成绘制（再次点击同一手柄、点击空白处或按<kbd>Esc</kbd>键均可取消）。点击任意连接线可将其选中并打开小弹窗，用于更改线条样式（实线/虚线）、起点与终点的端点样式（各自独立选择无/箭头/圆点）、粗细、颜色，或删除该线；选中连接线后按<kbd>Backspace</kbd>或<kbd>Delete</kbd>键也可将其删除。图示视图下工具栏会出现两个缩放按钮（也可使用<kbd>Ctrl++</kbd>/<kbd>Ctrl+-</kbd>）。对于希腊文/希伯来文工作区，译文会显示在每个方框下方，可直接编辑，更改也会同步显示在分句视图中。</p>
        <p><strong>右侧</strong>：</p>
        <ul>
          <li><strong>工作区标签</strong>（如<em>希腊文工作区</em>）——显示当前语言模式。</li>
          <li><strong>项目</strong>（<kbd>Alt+1</kbd>）——打开项目侧边栏。此快捷键在界面一同样有效。</li>
          <li><strong>圣经模块</strong>（<kbd>Alt+2</kbd>）——打开圣经模块侧边栏。</li>
          <li><strong>重新开始</strong>（<kbd>Ctrl+Shift+R</kbd>）——清除画布并返回语言选择界面。</li>
          <li><strong>帮助</strong>（<kbd>Ctrl+H</kbd>）——打开本帮助面板。</li>
          <li><strong>设置</strong>（<kbd>Ctrl+,</kbd>）——打开颜色主题编辑器。</li>
          <li><strong>EN / 简体切换</strong>（<kbd>Ctrl+Space</kbd>）——切换界面语言。</li>
        </ul>
      `
    },
    {
      id: 'projects',
      heading: '第五部分：项目面板',
      content: `
        <p>按<kbd>Alt+1</kbd>或工具栏文件夹图标打开，面板从左侧滑入。</p>
        <h3>保存</h3>
        <p>首次保存时按<kbd>Ctrl+S</kbd>。若已填写经文参考，应用将以此作为项目名称。</p>
        <p>首次保存后，项目将在每次更改时<strong>自动保存</strong>——分割行、缩进、编辑文字、更新批注等操作均会触发后台静默保存。屏幕右下角会短暂显示<em>"自动保存 · HH:MM"</em>，随后恢复为<em>"就绪"</em>。无需重复按<kbd>Ctrl+S</kbd>。</p>
        <p>项目保存在浏览器本地存储中。</p>
        <blockquote><strong>重要提示：</strong>清除浏览器数据时，本地存储中的项目会被删除。请定期将作品导出为JSON文件作为备份。</blockquote>
        <h3>打开和删除</h3>
        <p>点击项目卡片即可打开；每张卡片右侧有删除图标——点击后会弹出确认对话框，确认后删除项目，操作不可撤销。您也可以在界面一的<strong>最近项目</strong>列中使用同样的删除图标删除项目。</p>
        <h3>导出所有项目</h3>
        <p>点击面板底部的<strong>导出所有项目</strong>，选择<strong>所有项目导出为PDF</strong>或<strong>所有项目导出为JSON</strong>，所有已保存项目将打包为ZIP文件下载。</p>
      `
    },
    {
      id: 'bible',
      heading: '第六部分：圣经模块',
      content: `
        <p>按<kbd>Alt+2</kbd>或工具栏书本图标打开，面板从右侧滑入。</p>
        <h3>选择段落</h3>
        <p>点击<strong>选择经文…</strong>打开书卷选择器。选择书卷、章、节。按<kbd>Ctrl+Shift+[</kbd>和<kbd>Ctrl+Shift+]</kbd>切换章次。</p>
        <h3>可用版本</h3>
        <p><strong>离线版本：</strong>SBLGNT、拜占庭文本、七十士译本、WLC、和合本简体、和合本繁体、武加大。<br>
        <strong>在线版本（需网络）：</strong>NET圣经。</p>
        <p>新建标签页时，若界面语言为中文则默认选择<strong>和合本简体</strong>；英文界面且有网络则默认<strong>NET</strong>；无网络则默认<strong>SBLGNT</strong>。</p>
        <h3>NET圣经脚注</h3>
        <p>脚注标记以金色上标数字显示在经文中。<strong>悬停</strong>可查看提示框；<strong>点击</strong>（非分屏模式）可在窗格底部打开固定脚注框；点击✕或窗格其他位置关闭。分屏模式下点击无效，悬停仍然有效。</p>
        <h3>标签页</h3>
        <p>每个窗格最多支持五个标签。点击<strong>+</strong>新增；点击已选中的标签可切换版本；标签可在窗格间拖动。</p>
        <h3>分屏</h3>
        <p>点击分屏图标或按<kbd>Ctrl+\</kbd>在下方打开第二个窗格，可并排比较两段经文或两个版本。</p>
        <h3>滚动同步</h3>
        <p>点击面板标题中的锁定图标，启用上下窗格同步滚动。</p>
        <h3>固定面板</h3>
        <p>点击图钉图标或按 <kbd>Ctrl+Shift+\</kbd> 将圣经模块固定在画布右侧。拖动分隔线可调整宽度。再次点击图钉图标或按相同快捷键可取消固定。</p>
      `
    },
    {
      id: 'exporting',
      heading: '第七部分：导出',
      content: `
        <h3>导出为PDF</h3>
        <p>点击底部栏的<strong>导出▾</strong>，选择<em>导出为PDF</em>，或按<kbd>Ctrl+Shift+E</kbd>。PDF包含经文参考、版本标签、所有节码和行号标签、带缩进的原文和译文，以及来自批注卡片的脚注。</p>
        <p>两列会话（希伯来文/希腊文）输出横向A4；单列会话输出纵向A4。</p>
        <h3>导出为JSON</h3>
        <p>选择<em>导出为JSON</em>，保存当前工作的完整快照（行内容、缩进、格式、批注和设置）。可随时通过<kbd>Ctrl+O</kbd>或载入JSON按钮重新加载。JSON是长期备份和分享的推荐格式。</p>
      `
    },
    {
      id: 'settings',
      heading: '第八部分：设置',
      content: `
        <h3>颜色主题</h3>
        <p>按<kbd>Ctrl+,</kbd>或点击齿轮图标打开设置。可自定义六种颜色：背景、强调色、墨色、主题色、标签色和激活色。点击<strong>恢复默认</strong>还原原始配色。</p>
        <h3>清除圣经缓存</h3>
        <p>若圣经模块出现加载问题，可在设置中点击<strong>清除圣经缓存</strong>，离线版本将在下次访问时重新下载。</p>
        <h3>界面语言</h3>
        <p>点击工具栏中的<strong>EN / 简体</strong>按钮，或按<kbd>Ctrl+Space</kbd>，在英文和简体中文之间切换。您的语言偏好将在下次访问时自动恢复。</p>
      `
    },
    {
      id: 'brackets',
      heading: '第九部分：括号标注',
      content: `
        <p>括号功能让您直接在图解视图中标注结构关系——交叉配列、平行结构、首尾呼应、话语单元等。每个括号是一条带短横线（衬线）的竖线，跨越一行或多行，并可附加文字标注。</p>
        <h3>切换至图解视图</h3>
        <p>括号仅在<strong>图解视图</strong>中可用。点击工具栏中的<strong>图解</strong>按钮（或按<kbd>Alt+T</kbd>）进行切换。您的行内容将以缩进方块和连接线的形式呈现。</p>
        <h3>创建括号</h3>
        <ol>
          <li>按住<kbd>Shift</kbd>键。每个行方块右侧将出现一个圆形标记点（pip）。</li>
          <li>按住<kbd>Shift</kbd>的同时，点击要标注跨度的<strong>第一行</strong>标记点。状态栏显示<em>"括号已开始——请 Shift+点击另一行标记以完成。"</em></li>
          <li>再点击跨度<strong>最后一行</strong>的标记点，括号立即绘制完成。</li>
        </ol>
        <p>随时可按<kbd>Escape</kbd>取消待创建的括号。</p>
        <h3>编辑标注文字</h3>
        <p>每个括号右侧有文字标注区。括号创建后标注区显示淡色占位文字，点击即可直接输入，与编辑器中其他文字操作相同。按<kbd>Enter</kbd>或点击其他位置确认。标注宽度自动调整。</p>
        <h3>修改颜色、粗细及删除</h3>
        <p>点击括号竖线（或其标注文字）进行选择——出现金色边框，并弹出编辑面板，可进行以下操作：</p>
        <ul>
          <li>通过拾色器更改<strong>颜色</strong></li>
          <li>将<strong>粗细</strong>设为细、中或粗</li>
          <li>点击删除图标<strong>删除</strong>括号</li>
        </ul>
        <h3>调整跨度</h3>
        <p>拖动括号顶端或底端的<strong>衬线</strong>（横线），即可更改括号所跨的行范围。拖动时自动吸附至最近行，实时显示调整效果。</p>
        <h3>重新定位标注</h3>
        <p>将标注文字<strong>上下拖动</strong>，可沿括号竖线重新定位。小刻度线随之移动。标注被限制在括号顶端和底端衬线范围内。</p>
        <h3>嵌套括号</h3>
        <p>可创建多个括号。编辑器自动分配泳道：跨度完全被另一括号包含的内层括号将<strong>靠近方块</strong>放置，外层括号则依次向右排列，自然呈现交叉配列或同心结构，无需手动调整。</p>
        <h3>撤销与重做</h3>
        <p>所有括号操作——创建、删除、调整跨度、更改颜色、编辑标注、重新定位——均可通过<kbd>Ctrl+Z</kbd>撤销，<kbd>Ctrl+Y</kbd>重做。</p>
        <h3>保存</h3>
        <p>括号数据随项目自动保存，包含在JSON导出文件中，并出现在所有图解PDF导出中。</p>
      `
    },
    {
      id: 'slides',
      heading: '第十部分：幻灯片与演示模式',
      content: `
        <p>幻灯片功能让您将经文分析工作制作为演示文稿——选取特定行、控制元素的显示与隐藏、添加文本框，并通过投影窗口向课堂投影展示。</p>
        <h3>进入幻灯片视图</h3>
        <p>点击工具栏中的<strong>幻灯片</strong>按钮（或按<kbd>Alt+P</kbd>）。界面分为三列：左侧<strong>幻灯片缩略图列表</strong>、中央<strong>16:9幻灯片画布</strong>，以及右侧<strong>属性面板</strong>。</p>
        <h3>添加幻灯片</h3>
        <ul>
          <li><strong>添加空白幻灯片</strong>——创建不含经文内容的空白白色幻灯片。</li>
          <li><strong>添加内容幻灯片</strong>——创建预载当前会话所有行的幻灯片。</li>
        </ul>
        <p>点击缩略图选中幻灯片；拖动缩略图可重新排序；点击缩略图上的<strong>⋯</strong>按钮可复制或删除。</p>
        <h3>选择行</h3>
        <p>在右侧面板的<strong>节</strong>区域勾选要显示在本张幻灯片上的行——可以是单节经文、段落片段或整段经文。点击<strong>全选</strong>或<strong>全不选</strong>批量操作。</p>
        <h3>视图模式</h3>
        <p>每张幻灯片可选择以<strong>分析视图</strong>（带缩进的表格布局）或<strong>图解视图</strong>（方块与连接线布局）显示经文。在右侧面板中切换。</p>
        <h3>元素可见性</h3>
        <p>在右侧面板<strong>元素</strong>区域勾选或取消需要显示的内容：</p>
        <ul>
          <li><strong>缩进</strong>——显示或隐藏方块的缩进层级</li>
          <li><strong>译文行</strong>——显示或隐藏每个方块下方的译文行</li>
          <li><strong>注释</strong>——将批注文字以浮动框形式显示在幻灯片上</li>
          <li><strong>连接线</strong>——显示或隐藏SVG连接线（图解模式）</li>
          <li><strong>括号</strong>——显示或隐藏括号标注（图解模式）</li>
          <li><strong>标注</strong>——显示或隐藏浮动图解标签（图解模式）</li>
        </ul>
        <h3>刷新幻灯片</h3>
        <p>更改设置后，幻灯片画布不会实时更新（以避免卡顿）。点击工具栏中的<strong>刷新</strong>将当前行选择、视图模式和可见性设置应用到画布。点击缩略图时幻灯片也会自动刷新。</p>
        <h3>文本框</h3>
        <p>点击工具栏中的<strong>添加文本框</strong>，在幻灯片上放置文本框。操作方式：</p>
        <ul>
          <li><strong>单击</strong>文本框进行选中（出现金色边框和调整手柄）</li>
          <li><strong>拖动</strong>已选中的文本框以移动位置</li>
          <li><strong>拖动角部或边缘手柄</strong>以调整大小</li>
          <li><strong>双击</strong>进入文字编辑模式，直接输入内容，按<kbd>Escape</kbd>完成</li>
          <li><strong>右键点击</strong>查看选项：置于顶层、置于底层、删除</li>
        </ul>
        <h3>浮动标签与批注框</h3>
        <p>在元素面板勾选<strong>标注</strong>或<strong>注释</strong>后点击刷新，图解浮动标签和批注文字将作为独立可拖动框出现在幻灯片上。可自由拖动至任意位置，位置信息按幻灯片保存。</p>
        <h3>讲员备注</h3>
        <p>在右侧面板底部的<strong>讲员备注</strong>区域输入个人演讲备注。备注仅在演示者控制台中可见，不会显示在投影屏幕上。</p>
        <h3>演示模式</h3>
        <p>点击<strong>开始演示</strong>按钮，启动独立的投影窗口。主屏幕切换为<strong>演示者控制台</strong>：</p>
        <ul>
          <li><strong>左侧</strong>——当前幻灯片的实时预览</li>
          <li><strong>右侧</strong>——您的讲员备注（拖动分隔线可调整宽度）</li>
          <li><strong>底部栏</strong>——◀ 上一页 | 第N页/共M页 | 下一页 ▶ | 结束演示</li>
        </ul>
        <p>使用<kbd>←</kbd>/<kbd>→</kbd>方向键或屏幕按钮翻页。投影窗口即时更新。按<kbd>Escape</kbd>或点击<strong>结束演示</strong>返回幻灯片编辑器。</p>
        <p>演示前请将投影窗口拖至外部显示器，并按<kbd>F11</kbd>全屏显示。</p>
        <h3>导出幻灯片PDF</h3>
        <p>点击工具栏中的<strong>导出幻灯片PDF</strong>。每张幻灯片以全分辨率渲染，每页对应一张横向幻灯片。讲员备注不包含在PDF中。</p>
        <h3>撤销与重做</h3>
        <p>所有幻灯片操作——添加、删除、重排幻灯片；移动和调整文本框；更改可见性——均可通过<kbd>Ctrl+Z</kbd>撤销，<kbd>Ctrl+Y</kbd>重做。</p>
        <h3>保存</h3>
        <p>幻灯片组随项目自动保存为JSON文件的一部分，包含在所有项目导出中，重新打开项目时自动恢复。</p>
      `
    },
    {
      id: 'updates',
      heading: '第十一部分：更新',
      content: `
        <p>当应用在您使用期间发布更新时，屏幕底部将滑出一个提示横幅：<em>"新版本已就绪。"</em></p>
        <ul>
          <li>点击<strong>更新</strong>立即应用更新，页面将重新加载并显示确认提示。</li>
          <li>点击<strong>✕</strong>关闭。系统将显示不建议拒绝的提示，横幅折叠为小图标，随时可点击重新展开。</li>
        </ul>
        <p>若您在更新部署后以新标签页打开应用，更新将自动应用，并显示简短的"已更新到最新版本"提示。</p>
      `
    }
  ]
}

};

/* ── Render the tutorial into the tutorial pane ── */
function renderTutorial() {
  const lang = (typeof LANG_UI !== 'undefined' ? LANG_UI : 'en');
  const data = TUTORIAL[lang] || TUTORIAL.en;

  // Title
  const titleEl = document.getElementById('tut-title');
  if (titleEl) titleEl.textContent = data.title;

  // Outline
  const outlineEl = document.getElementById('tut-outline');
  if (outlineEl) {
    outlineEl.innerHTML = data.sections.map((s, i) =>
      `<a class="tut-ol-item${i === 0 ? ' active' : ''}" href="#tut-sec-${s.id}" onclick="tutScrollTo('${s.id}');return false;">${s.heading}</a>`
    ).join('');
  }

  // Content
  const contentEl = document.getElementById('tut-content');
  if (contentEl) {
    contentEl.innerHTML = data.sections.map(s =>
      `<section class="tut-section" id="tut-sec-${s.id}">
        <h2 class="tut-section-heading">${s.heading}</h2>
        ${s.content}
      </section>`
    ).join('');
  }

  // Reset scroll binding so the listener re-attaches after content replacement
  _tutScrollBound = false;
  _tutBindScroll();
}

function tutScrollTo(id) {
  const el = document.getElementById('tut-sec-' + id);
  const scroller = document.getElementById('tut-body');
  if (!el || !scroller) return;

  // Compute position of the element relative to the scrollable container
  const elTop = el.getBoundingClientRect().top;
  const scrollerTop = scroller.getBoundingClientRect().top;
  const targetScrollTop = scroller.scrollTop + (elTop - scrollerTop) - 16;

  scroller.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });

  // Immediately mark this outline item as active (don't wait for scroll event)
  document.querySelectorAll('.tut-ol-item').forEach(a => {
    const target = a.getAttribute('href').replace('#tut-sec-', '');
    a.classList.toggle('active', target === id);
  });
}

let _tutScrollBound = false;
function _tutBindScroll() {
  if (_tutScrollBound) return;
  _tutScrollBound = true;
  const scroller = document.getElementById('tut-body');
  if (!scroller) return;

  scroller.addEventListener('scroll', () => {
    const sections = Array.from(scroller.querySelectorAll('.tut-section'));
    const links = document.querySelectorAll('.tut-ol-item');
    if (!sections.length) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const threshold = scrollerRect.top + 80; // 80px from top of pane

    // Find the last section whose top is at or above the threshold
    let current = sections[0].id.replace('tut-sec-', '');
    for (const sec of sections) {
      const secTop = sec.getBoundingClientRect().top;
      if (secTop <= threshold) {
        current = sec.id.replace('tut-sec-', '');
      }
    }

    // Edge case: if scrolled to the very bottom, always activate the last section
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    if (atBottom) {
      current = sections[sections.length - 1].id.replace('tut-sec-', '');
    }

    links.forEach(a => {
      const target = a.getAttribute('href').replace('#tut-sec-', '');
      a.classList.toggle('active', target === current);
    });
  });
}
