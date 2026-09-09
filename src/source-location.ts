import { isAbsolute, relative } from "node:path";

export type SourcePosition = {
  offset: number;
  line: number;
  column: number;
};

export type SourceSpan = {
  start: SourcePosition;
  end: SourcePosition;
};

export type InstructionSource = {
  sourcePath?: string;
  span: SourceSpan;
};

export function formatSourceLocation(source: InstructionSource): string {
  return `${formatSourcePath(source.sourcePath)}:${source.span.start.line}:${
    source.span.start.column
  }`;
}

function formatSourcePath(sourcePath: string | undefined): string {
  if (sourcePath === undefined) {
    return "<anonymous source>";
  }

  const relativePath = relative(process.cwd(), sourcePath);

  if (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  ) {
    return relativePath;
  }

  return sourcePath;
}
