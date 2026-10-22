import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

/**
 * 保護 ``` ... ``` / ~~~ ... ~~~ code blocks。
 *
 * 不使用單一 regex 猜整塊，而是逐行判斷現在是否位於
 * fenced code block 裡。
 */
function protectFencedCodeBlocks(input: string) {
  const lines = input.split("\n");

  const codeBlocks: string[] = [];
  const output: string[] = [];

  let insideFence = false;
  let fenceChar = "";
  let fenceLength = 0;

  let currentBlock: string[] = [];

  for (const line of lines) {
    // 找 ```、````、~~~ 等 fence
    const match = line.match(/^\s*(`{3,}|~{3,})/);

    if (!insideFence) {
      if (match) {
        insideFence = true;

        fenceChar = match[1][0];
        fenceLength = match[1].length;

        currentBlock = [line];
      } else {
        output.push(line);
      }
    } else {
      currentBlock.push(line);

      const closingFenceRegex = new RegExp(
        `^\\s*${escapeRegExp(fenceChar)}{${fenceLength},}\\s*$`
      );

      if (closingFenceRegex.test(line)) {
        const index = codeBlocks.length;

        codeBlocks.push(currentBlock.join("\n"));

        output.push(
          `AIFENCEDCODEBLOCKTOKEN${index}ENDTOKEN`
        );

        insideFence = false;
        currentBlock = [];
        fenceChar = "";
        fenceLength = 0;
      }
    }
  }

  // 如果使用者貼進來的是還沒關閉的 code block，
  // 不要把資料弄丟。
  if (insideFence) {
    output.push(...currentBlock);
  }

  return {
    text: output.join("\n"),
    codeBlocks,
  };
}

function escapeRegExp(value: string) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/**
 * 保護 `inline code`
 */
function protectInlineCode(input: string) {
  const inlineCodes: string[] = [];

  const text = input.replace(
    /`([^`\n]+)`/g,
    (match) => {
      const index = inlineCodes.length;

      inlineCodes.push(match);

      return `AIINLINECODETOKEN${index}ENDTOKEN`;
    }
  );

  return {
    text,
    inlineCodes,
  };
}

/**
 * ChatGPT 常見數學語法：
 *
 * \[ ... \] → $$ ... $$
 * \( ... \) → $ ... $
 */
function normalizeMath(input: string) {
  return input
    // 部分來源會把行內數學的美元符號跳脫，例如 `\\$n\\$`；
    // 還原成 remark-math 可辨識的 `$n$`。
    .replace(/\\\$([^\n]+?)\\\$/g, "$$$1$$")
    // 有些來源（例如 Markdown/JSON 中的 escaped LaTeX）會把區塊
    // 分隔符輸出成 `\\\\[` / `\\\\]`。先還原分隔符，讓下面的
    // 標準 LaTeX 分隔符規則可以統一處理；數學內容本身保持不變。
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]")
    .replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_, equation) =>
        `\n\n$$\n${equation.trim()}\n$$\n\n`
    )
    .replace(
      /\\\(([\s\S]*?)\\\)/g,
      (_, equation) =>
        `$${equation.trim()}$`
    );
}

function restoreProtectedContent(
  input: string,
  codeBlocks: string[],
  inlineCodes: string[]
) {
  let result = input;

  codeBlocks.forEach((code, index) => {
    const token =
      `AIFENCEDCODEBLOCKTOKEN${index}ENDTOKEN`;

    result = result.split(token).join(code);
  });

  inlineCodes.forEach((code, index) => {
    const token =
      `AIINLINECODETOKEN${index}ENDTOKEN`;

    result = result.split(token).join(code);
  });

  return result;
}

/**
 * Notion 貼上純文字時不會把 Markdown 的 `$...$` 轉成公式，
 * 因此將常見的簡單行內數學改成可直接閱讀的文字與 Unicode 下標。
 */
function makeInlineMathNotionFriendly(input: string) {
  const subscripts: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };

  return input.replace(/\$([^$\n]+)\$/g, (match, equation: string) => {
    // 保留包含 LaTeX 指令的公式；只轉換可安全顯示為一般文字的內容。
    if (!/^[A-Za-z0-9_'=+\-(),.\s]+$/.test(equation)) {
      return match;
    }

    return equation.replace(/_([0-9])/g, (_, digit: string) =>
      subscripts[digit]
    );
  });
}

export function convertToNotion(
  input: string
): string {
  if (!input.trim()) {
    return "";
  }

  // STEP 1
  // 先把整個 fenced code block 拿走
  const fenced =
    protectFencedCodeBlocks(input);

  // STEP 2
  // 再保護 inline code
  const inline =
    protectInlineCode(fenced.text);

  // STEP 3
  // 這時候剩下的內容才允許處理數學
  const normalized =
    normalizeMath(inline.text);

  // STEP 4
  // Markdown → AST → Markdown
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: "-",
      fences: true,
      listItemIndent: "one",
    });

  const tree =
    processor.parse(normalized);

  let result =
    processor.stringify(tree);

  result = makeInlineMathNotionFriendly(result);

  // STEP 5
  // 最後才把程式碼原封不動塞回來
  result = restoreProtectedContent(
    result,
    fenced.codeBlocks,
    inline.inlineCodes
  );

  return result.trim();
}
