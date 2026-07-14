/* ════════════════════════════════════════════════════════
   LANG.JS  —  UI language (EN ↔ 简体中文)
   All translatable strings live here.
   DOM elements use data-i18n="key" for static text.
   Dynamic strings (toast, prompt, confirm) call t('key').
════════════════════════════════════════════════════════ */

const LANGS = {
  en: {
    /* ── Screen 1 ── */
    's1.title':            'Exegetical Phrasing Editor',
    's1.subtitle':         'Choose the original language for this session. This sets text direction and canvas layout.',
    's1.hebrew.label':     'עברית Hebrew',
    's1.hebrew.sub':       'RTL · Original + Translation columns',
    's1.greek.label':      'Greek',
    's1.greek.sub':        'LTR · Original + Translation columns',
    's1.cuv_s.label':      'Chinese (Simplified)',
    's1.cuv_s.sub':        'LTR · Single column · CUV Simplified',
    's1.cuv_t.label':      'Chinese (Traditional)',
    's1.cuv_t.sub':        'LTR · Single column · CUV Traditional',
    's1.other.label':      'Other Language',
    's1.other.sub':        'Single column · Paste any language or choose from our available versions',
    's1.other.placeholder':'Language name…',
    's1.other.confirm':    'Confirm',
    's1.load-json':        'Load JSON',
    's1.load-json.hint':   '(Ctrl+O)',
    's1.recent':           'Recent Projects',
    's1.no-projects':      'No saved projects yet.',
    's1.app-version':      'Version',

    /* ── Screen 2 ── */
    's2.add-passage-prefix': 'Add your ',
    's2.add-passage-suffix': ' passage',
    's2.paste.tab':        'Paste text',
    's2.bible.tab':        'Choose from Bible',
    's2.version.label':    'Translation / Version',
    's2.version.ph':       'e.g. NIV, ESV, NA28 — leave blank for default',
    's2.paste.tip':        '<b>Tip:</b> Lines starting with a verse number are detected automatically.',
    's2.corpus.label':     'Corpus',
    's2.book.label':       'Book',
    's2.chapter.label':    'Chapter',
    's2.verses.label':     'Verses',
    's2.verses.to':        'to',
    's2.version2.label':   'Version',
    's2.confirm':          'Confirm & Open Editor',
    's2.back':             '← Back',
    's2.skip':             'Skip — empty editor',

    /* ── Help modal ── */
    'help.title':          'Help',
    'help.tab.tutorial':   'Tutorial',
    'help.tab.shortcuts':  'Keyboard Shortcuts',
    'help.hint':           'All shortcuts use Ctrl on Windows/Linux and ⌘ on Mac.',
    'help.editing':        'Text Editing',
    'help.bold':           'Bold',
    'help.italic':         'Italic',
    'help.superscript':    'Superscript',
    'help.undo':           'Undo',
    'help.redo':           'Redo',
    'help.indent':         'Indentation',
    'help.indent-in':      'Indent line',
    'help.indent-out':     'Outdent line',
    'help.indent-bs':      'Outdent (also via)',
    'help.indent-bs.hint': 'at start of indented line',
    'help.rows':           'Row Operations',
    'help.split':          'Split row at caret',
    'help.add-row':        'Add empty line below',
    'help.split-pane':     'Toggle split pane in Bible Module (max 2)',
    'help.pin-bible':      'Pin/unpin Bible Module panel',
    'help.prev-chapter':   'Previous chapter (Bible Module)',
    'help.next-chapter':   'Next chapter (Bible Module)',
    'help.merge':          'Merge line up',
    'help.nav-up':         'Navigate row above',
    'help.nav-down':       'Navigate row below',
    'help.files':          'File Operations',
    'help.save':           'Save to app',
    'help.projects':       'Open Projects panel',
    'help.bible':          'Bible Module',
    'help.export':         'Export as PDF or JSON',
    'help.load':           'Load JSON from disk',
    'help.interface':      'Interface',
    'help.help':           'Open this help panel',
    'help.colors':         'Color settings',
    'help.restart':        'Restart session',
    'help.clear':          'Clear all content',
    'help.view-toggle':    'Toggle Phrasing / Diagram View',
    'help.conn-delete':    'Delete a selected connector',
    'help.conn-delete.hint': 'in Diagram View',
    'help.close':          'Close any open panel or popup',
    'help.lang-toggle':    'Switch UI language (EN ↔ 简体)',

    /* ── Settings modal ── */
    'settings.title':      'Settings',
    'settings.subtitle':   'Customize the editor palette.',
    'settings.bg':         'Background',
    'settings.bg.desc':    'Page and canvas background.',
    'settings.accent':     'Accent',
    'settings.accent.desc':'Highlights and active indicators.',
    'settings.ink':        'Ink',
    'settings.ink.desc':   'Primary body text color.',
    'settings.sig':        'Signature',
    'settings.sig.desc':   'Toolbar, comment headers, buttons.',
    'settings.label':      'Label',
    'settings.label.desc': 'Text on Signature-colored surfaces.',
    'settings.active':     'Active State',
    'settings.active.desc':'Line IDs and interactive emphasis.',
    'settings.reset':      'Reset to default',
    'settings.clear-cache':'Clear Bible Cache',
    'settings.cancel':     'Cancel',
    'settings.apply':      'Apply',

    /* ── Toolbar / editor ── */
    'toolbar.undo':        'Undo (Ctrl+Z)',
    'toolbar.redo':        'Redo (Ctrl+Y)',
    'toolbar.bold':        'Bold (Ctrl+B)',
    'toolbar.italic':      'Italic (Ctrl+I)',
    'toolbar.strike':      'Strikethrough (Ctrl+Shift+X)',
    'toolbar.sup':         'Superscript (Ctrl+.)',
    'toolbar.highlight':   'Highlight (Ctrl+Alt+H)',
    'toolbar.hl-remove':   'Remove highlight',
    'toolbar.size':        'Size',
    'toolbar.text-color':  'Text color',
    'toolbar.indent':      'Indent (Tab)',
    'toolbar.outdent':     'Outdent (Shift+Tab)',
    'view.phrasing':       'Phrasing',
    'view.diagram':        'Diagram',
    'view.phrasing.title': 'Phrasing View (Alt+T)',
    'view.diagram.title':  'Diagram View (Alt+T)',
    'diagram.empty-block': '(empty)',
    'diagram.empty-trans': '(translation)',
    'diagram.rightangle-handle': 'Draw right-angle line',
    'diagram.zoom-in':     'Zoom in (Ctrl++)',
    'diagram.zoom-out':    'Zoom out (Ctrl+-)',
    'diagram.zoom-reset':  'Reset zoom to 100% (Ctrl+0)',
    'help.zoom-reset':     'Reset diagram zoom to 100%',
    'diagram.add-label':   'Add label (Alt+L)',
    'toolbar.add-cmt':     'Add comment (Ctrl+Shift+M)',
    'toolbar.cmt-pane':    'Toggle comment pane (Alt+3)',
    'toast.select-block-first': 'Select a block first.',
    'diagram.label-ph':    'Label…',
    'diagram.delete-label':'Delete label',
    'help.add-label':      'Add floating label (Diagram View)',
    'conn.pattern.solid':  'Solid line',
    'conn.pattern.dotted': 'Dotted line',
    'conn.cap.start-label': 'Start',
    'conn.cap.end-label':   'End',
    'conn.cap.none':        'No endpoint',
    'conn.cap.arrow':       'Arrow',
    'conn.cap.dot':         'Dot',
    'conn.weight.1':       'Thin (1px)',
    'conn.weight.1-25':    '1.25px',
    'conn.weight.1-5':     '1.5px',
    'conn.weight.1-75':    'Thick (1.75px)',
    'conn.color':          'Line color',
    'palette.recent':      'Recently used',
    'palette.custom':      'Custom',
    'conn.delete':         'Delete connector (Backspace / Delete)',
    'conn.cap.start-title':'Start cap',
    'conn.cap.end-title':  'End cap',
    'conn.weight.title':   'Line thickness',
    'toolbar.projects':    'Projects (Alt+1)',
    'toolbar.bible':       'Bible Module (Alt+2)',
    'toolbar.restart':     'Restart session (Ctrl+Shift+R)',
    'toolbar.help':        'Keyboard shortcuts (Ctrl+H)',
    'toolbar.settings':    'Settings (Ctrl+,)',
    'col.verse':           'Verse',
    'col.line':            'Line',
    'col.original':        'Original',
    'col.translation':     'Translation',
    'refin.ph':            'Verse reference — e.g. John 1:1–10',
    'version.ph':          'Version (e.g., ESV, BHS, NA28)',
    'add-line':            'Add line',
    'merge-line':          'Merge line up',

    /* ── Bottom bar ── */
    'bbar.save':           'Save',
    'bbar.projects':       'Projects',
    'bbar.load-json':      'Load JSON',
    'bbar.export':         'Export ▾',
    'bbar.clear':          'Clear',
    'stbar.ready':         'Ready',

    /* ── Projects panel ── */
    'proj.title':          'My Projects',
    'proj.empty':          'No saved projects yet.<br>Press <b>Ctrl+S</b> to save your current work.',
    'proj.save-btn':       'Save current project',
    'proj.export-all-btn': 'Export all projects',

    /* ── Bible panel ── */
    'bible.title':         'Bible Module',
    'bible.offline':       '⚠ Offline — NET Bible unavailable.',
    'bible.select':        'Select passage…',
    'bible.add-tab':       'Add tab',
    'bible.clear-tab':     'Clear passage',
    'bible.ot':            'OLD TESTAMENT',
    'bible.nt':            'NEW TESTAMENT',
    'bible.switch-ver':    'Switch version',
    'bible.no-passage':    'No passage selected yet.<br>Click "Select passage…" above to begin.',

    /* ── Export popup ── */
    'export.pdf':          'Export as PDF',
    'export.diag-pdf':     'Export Diagram as PDF',
    'export.pdf.pagesize': 'Choose page size',
    'export.pdf.a4p':      'A4 Portrait',
    'export.pdf.a4l':      'A4 Landscape',
    'export.pdf.ltp':      'Letter Portrait',
    'export.pdf.ltl':      'Letter Landscape',
    'export.pdf.cancel':   'Cancel',
    'export.pdf.generating':'Generating PDF…',
    'export.all.title':    'Export all projects',
    'export.all.pdf':      'All projects as PDF',
    'export.all.diag-pdf': 'All projects as Diagram PDF',
    'export.all.json':     'All projects as JSON',
    'export.json':         'Export as JSON',

    /* ── Toast / prompts (used in JS via t()) ── */
    'toast.saved':         'Saved to app',
    'toast.saved-ts':      'Saved · ',
    'toast.autosaved':     'Auto-saved · ',
    'toast.loaded':        'Loaded · ',
    'toast.opened':        'Opened: ',
    'toast.cleared':       'Cleared — press Ctrl+Z to undo',
    'toast.cleared-short': 'Cleared',
    'toast.clear-undone':  'Clear undone',
    'toast.building-pdf':  'Building PDF…',
    'toast.pdf-done':      'Downloaded: ',
    'toast.export-cancel': 'Export cancelled — verse reference required',
    'toast.export-cancel2':'Export cancelled',
    'toast.save-cancel':   'Save cancelled',
    'toast.save-cancel2':  'Save cancelled — verse reference required',
    'toast.storage-full':  'Storage full — please export and clear some projects',
    'toast.load-error':    'Could not read file',
    'toast.proj-error':    'Could not open project',
    'toast.max-tabs':      'Maximum 5 tabs per pane',
    'toast.nothing-merge': 'Nothing to merge into',
    'toast.pdf-error':     'Export error: ',
    'toast.saving-pdf':    'Saving PDF…',
    'toast.bible-cleared': 'Bible cache cleared',
    'toast.cache-error':   'Could not clear cache: ',
    'toast.export-only':   'Use Export ▾ or Ctrl+Shift+E to export this document.',
    'toast.no-export':     'Nothing to export yet — open or start a project first.',

    /* ── Confirm / prompt dialogs ── */
    'confirm.restart':     'Restart session? All unsaved changes will be lost.',
    'confirm.clear':       'Clear all content?',
    'confirm.delete-proj': 'Delete this project from the app?\n\nThis cannot be undone.',
    'confirm.discard-colors': 'You have unsaved color changes. Discard them?',
    'prompt.save-name':    'Give this project a name:\n\nExample: John 1:1–10',
    'prompt.export-ref':   'Enter the verse reference before exporting.\n\nExample: John 1:1–10',
    'prompt.export-fname': 'Export as JSON\n\nFile name (without .json):',
    'prompt.save-as':      'Save as…\n\nFile name (without .json):',
    'prompt.version-ref':  'Enter the verse reference first.\n\nExample: John 1:1–10',
    'toast.save-renamed':  'Name matches existing file — saving as "',
    'toast.loading':          'Loading…',
    'toast.export-all-done':  'All projects exported.',
    'toast.no-projects-export': 'No saved projects to export.',
    'prompt.export-all-format': 'Export all projects as PDF or JSON?\n\nOK = PDF     Cancel = JSON',

    /* ── Screen 2 Bible: corpus labels ── */
    's2.ot':               'Old Testament',
    's2.nt':               'New Testament',

    /* ── Custom modal ── */
    'cmodal.ok':           'OK',
    'cmodal.save.title':   'Give this project a name:',
    'cmodal.save.hint':    'Example: John 1:1–10',
    'cmodal.ref.title':    'Enter the verse reference:',
    'cmodal.ref.hint':     'Example: John 1:1–10',
    'cmodal.fname.title':  'Export as JSON',
    'cmodal.fname.hint':   'File name (without .json):',
    'cmodal.saveas.title': 'Save as…',
    'cmodal.saveas.hint':  'File name (without .json):',

    /* ── Update banner ── */

    /* ── Lang toggle ── */
    'lang.toggle.title':   'Switch to Simplified Chinese (Ctrl+Space)',

    /* ── Brackets ── */
    'bracket.start-hint':  'Bracket started — Shift+click another row handle to complete',
    'bracket.cancel':      'Bracket cancelled',
    'bracket.label-ph':    'Label…',
    'bracket.edit.label':  'Label',
    'bracket.edit.color':  'Color',
    'bracket.edit.thickness': 'Thickness',
    'bracket.edit.delete': 'Delete bracket',
    'help.bracket':        'Add bracket (Shift+click two row handles)',

    /* ── Slides / Presenter ── */
    'slides.title':         'Slides',
    'slides.add-blank':     'Add Blank Slide',
    'slides.add-content':   'Add Content Slide',
    'slides.duplicate':     'Duplicate',
    'slides.delete':        'Delete Slide',
    'slides.bring-front':   'Bring to Front',
    'slides.send-back':     'Send to Back',
    'slides.no-rows':       'No rows selected. Choose rows from the panel to add passage content.',
    'slides.view-phrasing': 'Phrasing',
    'slides.view-diagram':  'Diagram',
    'slides.vis.section':   'Elements',
    'slides.vis.indent':    'Indentation',
    'slides.vis.trans':     'Translation lines',
    'slides.vis.verse':     'Verse numbers',
    'slides.vis.comments':  'Comments',
    'slides.vis.connectors':'Connectors',
    'slides.vis.brackets':  'Brackets',
    'slides.vis.labels':    'Labels',
    'slides.rows.all':      'All',
    'slides.rows.none':     'None',
    'slides.notes.ph':      'Speaker notes…',
    'slides.textbox.ph':    'Type here…',
    'slides.present':       'Present',
    'slides.end-present':   'End Presentation',
    'slides.slide-of':      'of',
    'slides.export-pdf':    'Export Slides PDF',
    'slides.add-textbox':   'Add Text Box',
    'slides.delete-el':     'Delete',
    'help.slides':          'Open Slides view (Alt+P)',

    /* ── Service worker update banner ── */
    'sw.banner':            'A new version is available.',
    'sw.update-btn':        'Update',
    'sw.dismiss':           '✕',
    'sw.warning':           'You are on an older version. It is recommended to update.',
    'sw.warn-close':        'Not now',
    'sw.updating':          'Updating…',
    'sw.pill':              'Update available',
    'sw.updated-toast':     'Updated to the latest version.',
    'sw.fresh-toast':       "You're on the latest version.",
  },

  zh: {
    /* ── Screen 1 ── */
    's1.title':            '经文分析编辑器',
    's1.subtitle':         '选择本次工作的原文语言，以设置文字方向和编辑器版面。',
    's1.hebrew.label':     'עברית 希伯来文',
    's1.hebrew.sub':       '从右到左 · 原文 + 译文两列',
    's1.greek.label':      '希腊文',
    's1.greek.sub':        '从左到右 · 原文 + 译文两列',
    's1.cuv_s.label':      '中文（简体）',
    's1.cuv_s.sub':        '从左到右 · 单列 · 和合本简体',
    's1.cuv_t.label':      '中文（繁體）',
    's1.cuv_t.sub':        '從左到右 · 單列 · 和合本繁體',
    's1.other.label':      '其他语言',
    's1.other.sub':        '单列 · 粘贴任何语言或从可用版本中选择',
    's1.other.placeholder':'语言名称…',
    's1.other.confirm':    '确认',
    's1.load-json':        '载入 JSON',
    's1.load-json.hint':   '(Ctrl+O)',
    's1.recent':           '最近项目',
    's1.no-projects':      '还没有已保存的项目。',
    's1.app-version':      '版本',

    /* ── Screen 2 ── */
    's2.add-passage-prefix': '添加你的',
    's2.add-passage-suffix': '经文',
    's2.paste.tab':        '粘贴文字',
    's2.bible.tab':        '从圣经选取',
    's2.version.label':    '译本 / 版本',
    's2.version.ph':       '例如 NIV、ESV、NA28——留空则使用默认',
    's2.paste.tip':        '<b>提示：</b>以数字开头的行会被自动识别为节次。',
    's2.corpus.label':     '经典',
    's2.book.label':       '书卷',
    's2.chapter.label':    '章',
    's2.verses.label':     '节',
    's2.verses.to':        '至',
    's2.version2.label':   '版本',
    's2.confirm':          '确认并开启编辑器',
    's2.back':             '← 返回',
    's2.skip':             '跳过——空白编辑器',

    /* ── Help modal ── */
    'help.title':          '帮助',
    'help.tab.tutorial':   '教程',
    'help.tab.shortcuts':  '键盘快捷键',
    'help.hint':           'Windows/Linux 使用 Ctrl，Mac 使用 ⌘。',
    'help.editing':        '文字编辑',
    'help.bold':           '粗体',
    'help.italic':         '斜体',
    'help.superscript':    '上标',
    'help.undo':           '撤销',
    'help.redo':           '重做',
    'help.indent':         '缩进',
    'help.indent-in':      '增加缩进',
    'help.indent-out':     '减少缩进',
    'help.indent-bs':      '减少缩进（亦可用）',
    'help.indent-bs.hint': '在已缩进行的行首按退格键',
    'help.rows':           '行操作',
    'help.split':          '在光标处分割行',
    'help.add-row':        '在下方添加空行',
    'help.split-pane':     '切换圣经模块分屏（最多 2 格）',
    'help.pin-bible':      '固定/取消固定圣经模块面板',
    'help.prev-chapter':   '上一章（圣经模块）',
    'help.next-chapter':   '下一章（圣经模块）',
    'help.merge':          '向上合并行',
    'help.nav-up':         '移至上一行',
    'help.nav-down':       '移至下一行',
    'help.files':          '文件操作',
    'help.save':           '保存到应用',
    'help.projects':       '打开项目面板',
    'help.bible':          '圣经模块',
    'help.export':         '导出为 PDF 或 JSON',
    'help.load':           '从磁盘载入 JSON',
    'help.interface':      '界面',
    'help.help':           '打开本帮助面板',
    'help.colors':         '颜色设置',
    'help.restart':        '重新开始工作',
    'help.clear':          '清除所有内容',
    'help.view-toggle':    '切换分句/图示视图',
    'help.conn-delete':    '删除选中的连接线',
    'help.conn-delete.hint': '图示视图中',
    'help.close':          '关闭任何已打开的面板或弹窗',
    'help.lang-toggle':    '切换界面语言（EN ↔ 简体）',

    /* ── Settings modal ── */
    'settings.title':      '设置',
    'settings.subtitle':   '自定义编辑器配色。',
    'settings.bg':         '背景',
    'settings.bg.desc':    '页面和画布的背景颜色。',
    'settings.accent':     '强调色',
    'settings.accent.desc':'高亮及活动指示。',
    'settings.ink':        '墨色',
    'settings.ink.desc':   '正文主色。',
    'settings.sig':        '主题色',
    'settings.sig.desc':   '工具栏、批注标题、按钮。',
    'settings.label':      '标签色',
    'settings.label.desc': '主题色表面上的文字颜色。',
    'settings.active':     '激活色',
    'settings.active.desc':'行号标识及交互强调。',
    'settings.reset':      '恢复默认',
    'settings.clear-cache':'清除圣经缓存',
    'settings.cancel':     '取消',
    'settings.apply':      '应用',

    /* ── Toolbar / editor ── */
    'toolbar.undo':        '撤销 (Ctrl+Z)',
    'toolbar.redo':        '重做 (Ctrl+Y)',
    'toolbar.bold':        '粗体 (Ctrl+B)',
    'toolbar.italic':      '斜体 (Ctrl+I)',
    'toolbar.strike':      '删除线 (Ctrl+Shift+X)',
    'toolbar.sup':         '上标 (Ctrl+.)',
    'toolbar.highlight':   '高亮 (Ctrl+Alt+H)',
    'toolbar.hl-remove':   '取消高亮',
    'toolbar.size':        '字号',
    'toolbar.text-color':  '文字颜色',
    'toolbar.indent':      '增加缩进 (Tab)',
    'toolbar.outdent':     '减少缩进 (Shift+Tab)',
    'view.phrasing':       '分句',
    'view.diagram':        '图示',
    'view.phrasing.title': '分句视图 (Alt+T)',
    'view.diagram.title':  '图示视图 (Alt+T)',
    'diagram.empty-block': '（空）',
    'diagram.empty-trans': '（译文）',
    'diagram.rightangle-handle': '绘制直角连接线',
    'diagram.zoom-in':     '放大 (Ctrl++)',
    'diagram.zoom-out':    '缩小 (Ctrl+-)',
    'diagram.zoom-reset':  '重置缩放至 100% (Ctrl+0)',
    'help.zoom-reset':     '重置图示缩放至 100%',
    'diagram.add-label':   '添加标注 (Alt+L)',
    'toolbar.add-cmt':     '添加注释 (Ctrl+Shift+M)',
    'toolbar.cmt-pane':    '切换注释面板 (Alt+3)',
    'toast.select-block-first': '请先选择一个块。',
    'diagram.label-ph':    '标注…',
    'diagram.delete-label':'删除标注',
    'help.add-label':      '添加浮动标注（图示视图）',
    'conn.pattern.solid':  '实线',
    'conn.pattern.dotted': '虚线',
    'conn.cap.start-label': '起点',
    'conn.cap.end-label':   '终点',
    'conn.cap.none':        '无端点',
    'conn.cap.arrow':       '箭头',
    'conn.cap.dot':         '圆点',
    'conn.weight.1':       '细 (1px)',
    'conn.weight.1-25':    '1.25px',
    'conn.weight.1-5':     '1.5px',
    'conn.weight.1-75':    '粗 (1.75px)',
    'conn.color':          '线条颜色',
    'palette.recent':      '最近使用',
    'palette.custom':      '自定义',
    'conn.delete':         '删除连接线 (Backspace / Delete)',
    'conn.cap.start-title':'起点类型',
    'conn.cap.end-title':  '终点类型',
    'conn.weight.title':   '线条粗细',
    'toolbar.projects':    '项目 (Alt+1)',
    'toolbar.bible':       '圣经模块 (Alt+2)',
    'toolbar.restart':     '重新开始 (Ctrl+Shift+R)',
    'toolbar.help':        '键盘快捷键 (Ctrl+H)',
    'toolbar.settings':    '设置 (Ctrl+,)',
    'col.verse':           '节',
    'col.line':            '行号',
    'col.original':        '原文',
    'col.translation':     '译文',
    'refin.ph':            '经文参考 — 例如 约翰福音 1:1–10',
    'version.ph':          '版本（例如 ESV、BHS、NA28）',
    'add-line':            '添加行',
    'merge-line':          '向上合并行',

    /* ── Bottom bar ── */
    'bbar.save':           '保存',
    'bbar.projects':       '项目',
    'bbar.load-json':      '载入 JSON',
    'bbar.export':         '导出 ▾',
    'bbar.clear':          '清除',
    'stbar.ready':         '就绪',

    /* ── Projects panel ── */
    'proj.title':          '我的项目',
    'proj.empty':          '还没有已保存的项目。<br>按 <b>Ctrl+S</b> 保存当前工作。',
    'proj.save-btn':       '保存当前项目',
    'proj.export-all-btn': '导出所有项目',

    /* ── Bible panel ── */
    'bible.title':         '圣经模块',
    'bible.offline':       '⚠ 离线——NET 圣经不可用。',
    'bible.select':        '选择经文…',
    'bible.add-tab':       '新增标签',
    'bible.clear-tab':     '清除经文',
    'bible.ot':            '旧约',
    'bible.nt':            '新约',
    'bible.switch-ver':    '切换版本',
    'bible.no-passage':    '尚未选择经文。<br>请点击上方"选择经文…"开始。',

    /* ── Export popup ── */
    'export.pdf':          '导出为 PDF',
    'export.diag-pdf':     '导出图示为 PDF',
    'export.pdf.pagesize': '选择页面大小',
    'export.pdf.a4p':      'A4 纵向',
    'export.pdf.a4l':      'A4 横向',
    'export.pdf.ltp':      'Letter 纵向',
    'export.pdf.ltl':      'Letter 横向',
    'export.pdf.cancel':   '取消',
    'export.pdf.generating':'正在生成 PDF…',
    'export.all.title':    '导出所有项目',
    'export.all.pdf':      '所有项目导出为 PDF',
    'export.all.diag-pdf': '所有项目导出为图示 PDF',
    'export.all.json':     '所有项目导出为 JSON',
    'export.json':         '导出为 JSON',

    /* ── Toast / prompts ── */
    'toast.saved':         '已保存到应用',
    'toast.saved-ts':      '已保存 · ',
    'toast.autosaved':     '自动保存 · ',
    'toast.loaded':        '已载入 · ',
    'toast.opened':        '已打开：',
    'toast.cleared':       '已清除——按 Ctrl+Z 撤销',
    'toast.cleared-short': '已清除',
    'toast.clear-undone':  '清除已撤销',
    'toast.building-pdf':  '正在生成 PDF…',
    'toast.pdf-done':      '已下载：',
    'toast.export-cancel': '导出已取消——请先输入经文参考',
    'toast.export-cancel2':'导出已取消',
    'toast.save-cancel':   '保存已取消',
    'toast.save-cancel2':  '保存已取消——请先输入经文参考',
    'toast.storage-full':  '存储已满——请导出并清除一些项目',
    'toast.load-error':    '无法读取文件',
    'toast.proj-error':    '无法打开项目',
    'toast.max-tabs':      '每个窗格最多 5 个标签',
    'toast.nothing-merge': '没有可向上合并的行',
    'toast.pdf-error':     '导出错误：',
    'toast.saving-pdf':    '正在保存 PDF…',
    'toast.bible-cleared': '圣经缓存已清除',
    'toast.cache-error':   '无法清除缓存：',
    'toast.export-only':   '请使用"导出 ▾"或 Ctrl+Shift+E 导出文档。',
    'toast.no-export':     '暂无可导出内容——请先打开或开始一个项目。',

    /* ── Confirm / prompt dialogs ── */
    'confirm.restart':     '重新开始？所有未保存的更改将会丢失。',
    'confirm.clear':       '清除所有内容？',
    'confirm.delete-proj': '从应用中删除此项目？\n\n此操作无法撤销。',
    'confirm.discard-colors': '有未保存的颜色更改，确定放弃？',
    'prompt.save-name':    '请为此项目命名：\n\n例如：约翰福音 1:1–10',
    'prompt.export-ref':   '导出前请输入经文参考。\n\n例如：约翰福音 1:1–10',
    'prompt.export-fname': '导出为 JSON\n\n文件名（无需 .json 后缀）：',
    'prompt.save-as':      '另存为…\n\n文件名（无需 .json 后缀）：',
    'prompt.version-ref':  '请先输入经文参考。\n\n例如：约翰福音 1:1–10',
    'toast.save-renamed':  '文件名与现有文件重复——另存为"',
    'toast.loading':          '加载中…',
    'toast.export-all-done':  '所有项目已导出。',
    'toast.no-projects-export': '没有已保存的项目可供导出。',
    'prompt.export-all-format': '将所有项目导出为 PDF 还是 JSON？\n\n确定 = PDF     取消 = JSON',

    /* ── Screen 2 Bible: corpus labels ── */
    's2.ot':               '旧约',
    's2.nt':               '新约',

    /* ── Custom modal ── */
    'cmodal.ok':           '确认',
    'cmodal.save.title':   '为此项目命名：',
    'cmodal.save.hint':    '例如：约翰福音 1:1–10',
    'cmodal.ref.title':    '请输入经文参考：',
    'cmodal.ref.hint':     '例如：约翰福音 1:1–10',
    'cmodal.fname.title':  '导出为 JSON',
    'cmodal.fname.hint':   '文件名（无需 .json 后缀）：',
    'cmodal.saveas.title': '另存为…',
    'cmodal.saveas.hint':  '文件名（无需 .json 后缀）：',

    /* ── Update banner ── */

    /* ── Lang toggle ── */
    'lang.toggle.title':   '切换为英文 (Ctrl+Space)',

    /* ── Brackets ── */
    'bracket.start-hint':  '括号已开始——请 Shift+点击另一行标记以完成',
    'bracket.cancel':      '括号已取消',
    'bracket.label-ph':    '标注…',
    'bracket.edit.label':  '标注',
    'bracket.edit.color':  '颜色',
    'bracket.edit.thickness': '粗细',
    'bracket.edit.delete': '删除括号',
    'help.bracket':        '添加括号（Shift+点击两个行标记）',

    /* ── Slides / Presenter ── */
    'slides.title':         '幻灯片',
    'slides.add-blank':     '添加空白幻灯片',
    'slides.add-content':   '添加内容幻灯片',
    'slides.duplicate':     '复制',
    'slides.delete':        '删除幻灯片',
    'slides.bring-front':   '置于顶层',
    'slides.send-back':     '置于底层',
    'slides.no-rows':       '未选择任何行。请在右侧面板选择经文行以添加内容。',
    'slides.view-phrasing': '分析视图',
    'slides.view-diagram':  '图解视图',
    'slides.vis.section':   '元素',
    'slides.vis.indent':    '缩进',
    'slides.vis.trans':     '译文行',
    'slides.vis.verse':     '节次编号',
    'slides.vis.comments':  '注释',
    'slides.vis.connectors':'连接线',
    'slides.vis.brackets':  '括号',
    'slides.vis.labels':    '标注',
    'slides.rows.all':      '全选',
    'slides.rows.none':     '全不选',
    'slides.notes.ph':      '讲员备注…',
    'slides.textbox.ph':    '在此输入…',
    'slides.present':       '开始演示',
    'slides.end-present':   '结束演示',
    'slides.slide-of':      '/',
    'slides.export-pdf':    '导出幻灯片 PDF',
    'slides.add-textbox':   '添加文本框',
    'slides.delete-el':     '删除',
    'help.slides':          '打开幻灯片视图（Alt+P）',

    /* ── Service worker update banner ── */
    'sw.banner':            '新版本已就绪。',
    'sw.update-btn':        '更新',
    'sw.dismiss':           '✕',
    'sw.warning':           '您正在使用旧版本，建议立即更新。',
    'sw.warn-close':        '暂不更新',
    'sw.updating':          '更新中…',
    'sw.pill':              '有可用更新',
    'sw.updated-toast':     '已更新到最新版本。',
    'sw.fresh-toast':       '您正在使用最新版本。',
  }
};

/* ── Active language ── */
let LANG_UI = 'en';
try {
  const saved = localStorage.getItem('exeg-ui-lang');
  if (saved === 'zh' || saved === 'en') LANG_UI = saved;
} catch(_) {}

/* ── Translate a key ── */
function t(key) {
  return (LANGS[LANG_UI] && LANGS[LANG_UI][key]) || (LANGS.en[key]) || key;
}

/* ── Apply to all data-i18n elements in the DOM ── */
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.hasAttribute('data-i18n-html')) {
      el.innerHTML = val;
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });

  // Update title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });

  // Update placeholder-only elements
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });

  // Sync both toggle labels (toolbar + S1/S2 pill)
  // Label shows the CURRENT language so user knows which mode is active.
  const newLabel = LANG_UI === 'en' ? 'EN' : '简体';
  const toggleLabel = document.getElementById('lang-toggle-label');
  if (toggleLabel) toggleLabel.textContent = newLabel;
  document.querySelectorAll('.lang-toggle-s12-label').forEach(el => {
    el.textContent = newLabel;
  });

  // Show/hide the S1/S2 pill — only visible when the editor (#app) is not open
  _updateS12Pill();

  // Update dynamically-rendered project empty state
  const projEmpty = document.getElementById('proj-list-empty');
  if (projEmpty) projEmpty.innerHTML = t('proj.empty');

  // Update Bible panel empty panes
  document.querySelectorAll('.bpane-empty').forEach(el => {
    el.innerHTML = t('bible.no-passage');
  });

  // Update Bible picker buttons that still show default text
  document.querySelectorAll('.bpane-picker-btn').forEach(btn => {
    if (btn.textContent === 'Select passage…' || btn.textContent === '选择经文…') {
      btn.textContent = t('bible.select');
    }
  });

  // Status bar
  const stbar = document.getElementById('stbar');
  if (stbar && (stbar.textContent === 'Ready' || stbar.textContent === '就绪')) {
    stbar.textContent = t('stbar.ready');
  }

  // Update Size dropdown placeholder
  const tbSz = document.getElementById('tb-sz');
  if (tbSz) {
    const disabledOpt = tbSz.querySelector('option[disabled]');
    if (disabledOpt) disabledOpt.textContent = t('toolbar.size');
  }

  // Re-render projects panel if open
  if (typeof renderProjPanel === 'function') renderProjPanel();

  // Re-render Screen 1 recent projects (translates "No saved projects yet.")
  if (typeof renderS1Recent === 'function') renderS1Recent();

  // Re-apply session-specific labels (session badge, column headers)
  if (typeof _applySessionLabels === 'function') _applySessionLabels();

  // Re-render Bible picker buttons with correct language for passage labels
  if (typeof bUpdatePickerBtn === 'function') {
    bUpdatePickerBtn('top');
    bUpdatePickerBtn('bottom');
  }

  // When switching to Chinese, update any unloaded (cleared) Bible tabs to CUV Simplified.
  // Loaded tabs (cleared:false) keep their current passage/version.
  if (typeof bTabs !== 'undefined') {
    const targetVer = LANG_UI === 'zh' ? 'cuv_s' : null;
    if (targetVer) {
      ['top','bottom'].forEach(section => {
        if (!Array.isArray(bTabs[section])) return;
        bTabs[section].forEach(tab => {
          if (tab.cleared) tab.version = targetVer;
        });
        if (typeof bRenderTabBar === 'function') bRenderTabBar(section);
        if (typeof bUpdatePickerBtn === 'function') bUpdatePickerBtn(section);
      });
    }
  }

  // Re-render tutorial if help modal is open on the tutorial tab
  const _helpModal = document.getElementById('help-modal');
  const _tutPane = document.getElementById('help-pane-tutorial');
  if (_helpModal && !_helpModal.classList.contains('hidden') &&
      _tutPane && _tutPane.style.display !== 'none') {
    if (typeof renderTutorial === 'function') renderTutorial();
  }

  // Re-render Diagram View if it's the active canvas (verse-separator labels
  // and empty-block placeholder text are localized)
  if (typeof refreshDiagramIfActive === 'function') refreshDiagramIfActive();
}

/* ── Show S1/S2 pill when app is not visible ── */
function _updateS12Pill() {
  const pill = document.getElementById('lang-toggle-s12');
  if (!pill) return;
  const app = document.getElementById('app');
  const inEditor = app && (app.style.display === 'flex' || app.style.display === 'block');
  pill.style.display = inEditor ? 'none' : 'block';
}

/* ── Toggle language ── */
function toggleLang() {
  LANG_UI = LANG_UI === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('exeg-ui-lang', LANG_UI); } catch(_) {}
  applyLang();
}

/* ── Run on load ── */
document.addEventListener('DOMContentLoaded', () => {
  applyLang();
});
