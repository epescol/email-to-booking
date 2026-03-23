import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Link as LinkIcon, Undo, Redo, AlignLeft, AlignCenter, AlignRight,
  Heading2, Heading3, Code, Image as ImageIcon, Palette,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState, useCallback } from "react";

interface WysiwygEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function WysiwygEditor({ content, onChange, placeholder }: WysiwygEditorProps) {
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content,
    onUpdate: ({ editor }) => {
      if (!htmlMode) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[150px] px-3 py-2 focus:outline-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_img]:max-w-full [&_img]:rounded-md",
      },
    },
  });

  // Sync external content changes (e.g. template applied)
  useEffect(() => {
    if (editor && !htmlMode && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    if (htmlMode) {
      setHtmlSource(content);
    }
  }, [content, editor, htmlMode]);

  const toggleHtmlMode = useCallback(() => {
    if (htmlMode) {
      // Switching back to WYSIWYG: apply HTML source
      if (editor) {
        editor.commands.setContent(htmlSource, { emitUpdate: false });
        onChange(htmlSource);
      }
    } else {
      // Switching to HTML: populate source from editor
      if (editor) {
        setHtmlSource(editor.getHTML());
      }
    }
    setHtmlMode(!htmlMode);
  }, [htmlMode, htmlSource, editor, onChange]);

  const handleHtmlSourceChange = (val: string) => {
    setHtmlSource(val);
    onChange(val);
  };

  const addLink = () => {
    if (!editor) return;
    const url = window.prompt("URL:", "https://");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    if (!editor) return;
    const url = window.prompt("URL immagine:", "https://");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const setColor = () => {
    if (!editor) return;
    const color = window.prompt("Colore (es. #ff0000):", "#000000");
    if (color) {
      editor.chain().focus().setColor(color).run();
    }
  };

  if (!editor) return null;

  return (
    <div className="rounded-md border border-input bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
        <Toggle
          size="sm"
          pressed={editor.isActive("heading", { level: 2 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Titolo 2"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("heading", { level: 3 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Titolo 3"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Toggle
          size="sm"
          pressed={editor.isActive("bold")}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Grassetto"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("italic")}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Corsivo"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("underline")}
          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Sottolineato"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Toggle
          size="sm"
          pressed={editor.isActive({ textAlign: "left" })}
          onPressedChange={() => editor.chain().focus().setTextAlign("left").run()}
          aria-label="Allinea a sinistra"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive({ textAlign: "center" })}
          onPressedChange={() => editor.chain().focus().setTextAlign("center").run()}
          aria-label="Centra"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive({ textAlign: "right" })}
          onPressedChange={() => editor.chain().focus().setTextAlign("right").run()}
          aria-label="Allinea a destra"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Toggle
          size="sm"
          pressed={editor.isActive("bulletList")}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Elenco puntato"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <List className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("orderedList")}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Elenco numerato"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Toggle>

        <div className="w-px h-5 bg-border mx-0.5" />

        <Toggle
          size="sm"
          pressed={editor.isActive("link")}
          onPressedChange={addLink}
          aria-label="Link"
          className="h-7 w-7 p-0"
          disabled={htmlMode}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Toggle>
        <button
          onClick={addImage}
          className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-sm hover:bg-muted disabled:opacity-50"
          disabled={htmlMode}
          title="Inserisci immagine"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={setColor}
          className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-sm hover:bg-muted disabled:opacity-50"
          disabled={htmlMode}
          title="Colore testo"
        >
          <Palette className="h-3.5 w-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          <Toggle
            size="sm"
            onPressedChange={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo() || htmlMode}
            aria-label="Annulla"
            className="h-7 w-7 p-0"
          >
            <Undo className="h-3.5 w-3.5" />
          </Toggle>
          <Toggle
            size="sm"
            onPressedChange={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo() || htmlMode}
            aria-label="Ripeti"
            className="h-7 w-7 p-0"
          >
            <Redo className="h-3.5 w-3.5" />
          </Toggle>

          <div className="w-px h-5 bg-border mx-0.5" />

          <Button
            variant={htmlMode ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={toggleHtmlMode}
          >
            <Code className="h-3.5 w-3.5 mr-1" />
            HTML
          </Button>
        </div>
      </div>

      {/* Editor or HTML source */}
      {htmlMode ? (
        <Textarea
          value={htmlSource}
          onChange={(e) => handleHtmlSourceChange(e.target.value)}
          className="border-0 rounded-none min-h-[150px] font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder="<p>Scrivi HTML...</p>"
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
