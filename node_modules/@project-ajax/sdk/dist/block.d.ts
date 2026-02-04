type ApiColor = "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red" | "gray_background" | "brown_background" | "orange_background" | "yellow_background" | "green_background" | "blue_background" | "purple_background" | "pink_background" | "red_background";
type RichTextAnnotations = {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: ApiColor;
};
type RichTextBase = {
    plain_text: string;
    href: string | null;
    annotations: RichTextAnnotations;
};
type TextContent = {
    content: string;
    link: {
        url: string;
    } | null;
};
type EquationContent = {
    expression: string;
};
type DateMention = {
    type: "date";
    date: {
        start: string;
        end?: string | null;
        time_zone?: string | null;
    };
};
type CustomEmojiMention = {
    type: "custom_emoji";
    custom_emoji: {
        id: string;
        name?: string;
        url?: string;
    };
};
type LinkPreviewMention = {
    type: "link_preview";
    link_preview: {
        url: string;
    };
};
type LinkMention = {
    type: "link_mention";
    link_mention: {
        href: string;
    };
};
type MentionContent = DateMention | CustomEmojiMention | LinkPreviewMention | LinkMention;
type RichTextItem = RichTextBase & ({
    type: "text";
    text: TextContent;
} | {
    type: "mention";
    mention: MentionContent;
} | {
    type: "equation";
    equation: EquationContent;
});
type RichText = RichTextItem[];
type EmojiIcon = {
    type: "emoji";
    emoji: string;
};
type ExternalIcon = {
    type: "external";
    external: {
        url: string;
    };
};
type FileIcon = {
    type: "file";
    file: {
        url: string;
        expiry_time: string;
    };
};
type Icon = EmojiIcon | ExternalIcon | FileIcon;
type ExternalFile = {
    type: "external";
    external: {
        url: string;
    };
};
type HostedFile = {
    type: "file";
    file: {
        url: string;
        expiry_time: string;
    };
    name?: string;
};
type FileObject = ExternalFile | HostedFile;
type BlockBase = {
    object: "block";
};
type ParagraphBlock = BlockBase & {
    type: "paragraph";
    paragraph: {
        rich_text: RichText;
        color?: ApiColor;
        children?: Block[];
    };
};
type Heading1Block = BlockBase & {
    type: "heading_1";
    heading_1: {
        rich_text: RichText;
        color?: ApiColor;
        is_toggleable?: boolean;
        children?: Block[];
    };
};
type Heading2Block = BlockBase & {
    type: "heading_2";
    heading_2: {
        rich_text: RichText;
        color?: ApiColor;
        is_toggleable?: boolean;
        children?: Block[];
    };
};
type Heading3Block = BlockBase & {
    type: "heading_3";
    heading_3: {
        rich_text: RichText;
        color?: ApiColor;
        is_toggleable?: boolean;
        children?: Block[];
    };
};
type BulletedListItemBlock = BlockBase & {
    type: "bulleted_list_item";
    bulleted_list_item: {
        rich_text: RichText;
        color?: ApiColor;
        children?: Block[];
    };
};
type NumberedListItemBlock = BlockBase & {
    type: "numbered_list_item";
    numbered_list_item: {
        rich_text: RichText;
        color?: ApiColor;
        children?: Block[];
    };
};
type ToDoBlock = BlockBase & {
    type: "to_do";
    to_do: {
        rich_text: RichText;
        checked: boolean;
        color?: ApiColor;
        children?: Block[];
    };
};
type ToggleBlock = BlockBase & {
    type: "toggle";
    toggle: {
        rich_text: RichText;
        color?: ApiColor;
        children?: Block[];
    };
};
type QuoteBlock = BlockBase & {
    type: "quote";
    quote: {
        rich_text: RichText;
        color?: ApiColor;
        children?: Block[];
    };
};
type CalloutBlock = BlockBase & {
    type: "callout";
    callout: {
        rich_text: RichText;
        icon?: Icon | null;
        color?: ApiColor;
        children?: Block[];
    };
};
type CodeBlock = BlockBase & {
    type: "code";
    code: {
        rich_text: RichText;
        caption?: RichText;
        language: string;
    };
};
type EquationBlock = BlockBase & {
    type: "equation";
    equation: {
        expression: string;
    };
};
type DividerBlock = BlockBase & {
    type: "divider";
    divider: Record<string, never>;
};
type BreadcrumbBlock = BlockBase & {
    type: "breadcrumb";
    breadcrumb: Record<string, never>;
};
type TableOfContentsBlock = BlockBase & {
    type: "table_of_contents";
    table_of_contents: {
        color?: ApiColor;
    };
};
type ColumnListBlock = BlockBase & {
    type: "column_list";
    column_list: {
        children: ColumnBlock[];
    };
};
type ColumnBlock = BlockBase & {
    type: "column";
    column: {
        children?: Block[];
    };
};
type ImageBlock = BlockBase & {
    type: "image";
    image: FileObject & {
        caption?: RichText;
    };
};
type VideoBlock = BlockBase & {
    type: "video";
    video: FileObject & {
        caption?: RichText;
    };
};
type AudioBlock = BlockBase & {
    type: "audio";
    audio: FileObject & {
        caption?: RichText;
    };
};
type PDFBlock = BlockBase & {
    type: "pdf";
    pdf: FileObject & {
        caption?: RichText;
    };
};
type FileBlock = BlockBase & {
    type: "file";
    file: FileObject & {
        caption?: RichText;
    };
};
type EmbedBlock = BlockBase & {
    type: "embed";
    embed: {
        url: string;
        caption?: RichText;
    };
};
type BookmarkBlock = BlockBase & {
    type: "bookmark";
    bookmark: {
        url: string;
        caption?: RichText;
    };
};
type LinkPreviewBlock = BlockBase & {
    type: "link_preview";
    link_preview: {
        url: string;
    };
};
type ChildPageBlock = BlockBase & {
    type: "child_page";
    child_page: {
        title: string;
    };
};
type ChildDatabaseBlock = BlockBase & {
    type: "child_database";
    child_database: {
        title: string;
    };
};
type TemplateBlock = BlockBase & {
    type: "template";
    template: {
        rich_text: RichText;
        children?: Block[];
    };
};
type TableBlock = BlockBase & {
    type: "table";
    table: {
        table_width: number;
        has_column_header: boolean;
        has_row_header: boolean;
        children: TableRowBlock[];
    };
};
type TableRowBlock = BlockBase & {
    type: "table_row";
    table_row: {
        cells: RichText[];
    };
};
type AIBlock = BlockBase & {
    type: "ai_block";
    ai_block: {
        prompt?: string;
    };
};
type UnsupportedBlock = BlockBase & {
    type: "unsupported";
    unsupported: Record<string, never>;
};
type Block = ParagraphBlock | Heading1Block | Heading2Block | Heading3Block | BulletedListItemBlock | NumberedListItemBlock | ToDoBlock | ToggleBlock | QuoteBlock | CalloutBlock | CodeBlock | EquationBlock | DividerBlock | BreadcrumbBlock | TableOfContentsBlock | ColumnListBlock | ColumnBlock | ImageBlock | VideoBlock | AudioBlock | PDFBlock | FileBlock | EmbedBlock | BookmarkBlock | LinkPreviewBlock | ChildPageBlock | ChildDatabaseBlock | TemplateBlock | TableBlock | TableRowBlock | AIBlock | UnsupportedBlock;
export type { RichText, RichTextItem, RichTextBase, RichTextAnnotations, TextContent, EquationContent, MentionContent, DateMention, CustomEmojiMention, LinkPreviewMention, LinkMention, ApiColor, Icon, EmojiIcon, ExternalIcon, FileIcon, FileObject, ExternalFile, HostedFile, BlockBase, ParagraphBlock, Heading1Block, Heading2Block, Heading3Block, BulletedListItemBlock, NumberedListItemBlock, ToDoBlock, ToggleBlock, QuoteBlock, CalloutBlock, CodeBlock, EquationBlock, DividerBlock, BreadcrumbBlock, TableOfContentsBlock, ColumnListBlock, ColumnBlock, ImageBlock, VideoBlock, AudioBlock, PDFBlock, FileBlock, EmbedBlock, BookmarkBlock, LinkPreviewBlock, ChildPageBlock, ChildDatabaseBlock, TemplateBlock, TableBlock, TableRowBlock, AIBlock, UnsupportedBlock, Block, };
//# sourceMappingURL=block.d.ts.map