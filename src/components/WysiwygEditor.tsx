import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Undo, Redo } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { useEffect } from "react";

interface WysiwygEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function WysiwygEditor({ content, onChange, placeholder }: WysiwygEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[120px] px-3 py-2 focus:outline-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
      },
    },
  });

  // Sync external content changes (e.g. template applied)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("URL:", "https://");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className="rounded-md border border-input bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1">
        <Toggle
          size="sm"
          pressed={editor.isActive("bold")}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Grassetto"
          className="h-7 w-7 p-0"
        >
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("italic")}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Corsivo"
          className="h-7 w-7 p-0"
        >
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("bulletList")}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Elenco puntato"
          className="h-7 w-7 p-0"
        >
          <List className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("orderedList")}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Elenco numerato"
          className="h-7 w-7 p-0"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("link")}
          onPressedChange={addLink}
          aria-label="Link"
          className="h-7 w-7 p-0"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Toggle>

        <div className="ml-auto flex items-center gap-0.5">
          <Toggle
            size="sm"
            onPressedChange={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            aria-label="Annulla"
            className="h-7 w-7 p-0"
          >
            <Undo className="h-3.5 w-3.5" />
          </Toggle>
          <Toggle
            size="sm"
            onPressedChange={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            aria-label="Ripeti"
            className="h-7 w-7 p-0"
          >
            <Redo className="h-3.5 w-3.5" />
          </Toggle>
        </div>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Placeholder when empty */}
      {editor.isEmpty && placeholder && (
        <div className="pointer-events-none absolute px-3 py-2 text-sm text-muted-foreground -mt-[120px]">
          {placeholder}
        </div>
      )}
    </div>
  );
}
