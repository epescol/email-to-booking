import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  ClassicEditor,
  Essentials,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading,
  Paragraph,
  Link,
  List,
  Alignment,
  Font,
  Image,
  ImageInsertViaUrl,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  Table,
  TableToolbar,
  TableProperties,
  TableCellProperties,
  BlockQuote,
  Indent,
  IndentBlock,
  MediaEmbed,
  HorizontalLine,
  SourceEditing,
  GeneralHtmlSupport,
  Undo,
  PasteFromOffice,
  RemoveFormat,
  HtmlEmbed,
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import { useRef, useEffect } from "react";

interface WysiwygEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const EDITOR_CONFIG = {
  licenseKey: "GPL" as const,
  plugins: [
    Essentials, Bold, Italic, Underline, Strikethrough,
    Heading, Paragraph, Link, List, Alignment,
    Font, Image, ImageInsertViaUrl, ImageResize, ImageStyle, ImageToolbar,
    Table, TableToolbar, TableProperties, TableCellProperties,
    BlockQuote, Indent, IndentBlock, MediaEmbed,
    HorizontalLine, SourceEditing, GeneralHtmlSupport,
    Undo, PasteFromOffice, RemoveFormat, HtmlEmbed,
  ],
  toolbar: {
    items: [
      "undo", "redo",
      "|",
      "heading",
      "|",
      "bold", "italic", "underline", "strikethrough", "removeFormat",
      "|",
      "fontSize", "fontColor", "fontBackgroundColor",
      "|",
      "alignment",
      "|",
      "bulletedList", "numberedList", "outdent", "indent",
      "|",
      "link", "insertImage", "insertTable", "blockQuote", "horizontalLine", "htmlEmbed",
      "|",
      "sourceEditing",
    ],
    shouldNotGroupWhenFull: false,
  },
  heading: {
    options: [
      { model: "paragraph" as const, title: "Paragrafo", class: "ck-heading_paragraph" },
      { model: "heading1" as const, view: "h1", title: "Titolo 1", class: "ck-heading_heading1" },
      { model: "heading2" as const, view: "h2", title: "Titolo 2", class: "ck-heading_heading2" },
      { model: "heading3" as const, view: "h3", title: "Titolo 3", class: "ck-heading_heading3" },
    ],
  },
  fontSize: {
    options: [10, 12, 14, 16, 18, 20, 24, 28, 32],
  },
  image: {
    toolbar: [
      "imageStyle:inline", "imageStyle:block", "imageStyle:side",
      "|", "imageTextAlternative",
    ],
    insert: { type: "auto" as const },
  },
  table: {
    contentToolbar: [
      "tableColumn", "tableRow", "mergeTableCells",
      "tableProperties", "tableCellProperties",
    ],
  },
  htmlSupport: {
    allow: [
      { name: /.*/} as any,
    ],
  },
  placeholder: "Scrivi il contenuto...",
};

export function WysiwygEditor({ content, onChange, placeholder }: WysiwygEditorProps) {
  const editorRef = useRef<ClassicEditor | null>(null);
  const lastExternalContent = useRef(content);

  // Sync external content changes (e.g. template applied)
  useEffect(() => {
    if (editorRef.current && content !== lastExternalContent.current) {
      const currentData = editorRef.current.getData();
      if (content !== currentData) {
        editorRef.current.setData(content);
      }
      lastExternalContent.current = content;
    }
  }, [content]);

  const config = {
    ...EDITOR_CONFIG,
    placeholder: placeholder || EDITOR_CONFIG.placeholder,
    initialData: content,
  };

  return (
    <div className="ckeditor-wrapper rounded-md border border-input bg-background overflow-hidden [&_.ck.ck-editor__main>.ck-editor__editable]:!min-h-[240px] [&_.ck-editor__editable]:max-h-[500px] [&_.ck-editor__editable]:overflow-y-auto [&_.ck.ck-editor__main>.ck-editor__editable]:border-0 [&_.ck.ck-toolbar]:border-0 [&_.ck.ck-toolbar]:border-b [&_.ck.ck-toolbar]:border-input [&_.ck-rounded-corners_.ck.ck-editor__top_.ck-sticky-panel_.ck-toolbar]:rounded-none [&_.ck.ck-editor]:rounded-none">
      <CKEditor
        editor={ClassicEditor}
        config={config}
        onReady={(editor) => {
          editorRef.current = editor;
        }}
        onChange={(_event, editor) => {
          const data = editor.getData();
          lastExternalContent.current = data;
          onChange(data);
        }}
      />
    </div>
  );
}
