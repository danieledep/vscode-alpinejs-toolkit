import * as vscode from "vscode";
import { findComponentFiles, findXDataComponentNames } from "./alpineUtils";

export class AlpineDataHoverProvider implements vscode.HoverProvider {
	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
	): Promise<vscode.Hover | undefined> {
		const fullText = document.getText();
		const matches = findXDataComponentNames(fullText);

		for (const m of matches) {
			const nameStart = document.positionAt(m.offset);
			const nameEnd = document.positionAt(m.offset + m.length);
			const range = new vscode.Range(nameStart, nameEnd);

			if (!range.contains(position)) continue;

			const files = await findComponentFiles(m.name);
			const md = new vscode.MarkdownString();
			md.isTrusted = true;
			md.appendMarkdown(`**${m.name}**\n\n`);

			if (files.length === 0) {
				md.appendMarkdown(
					`$(error) Alpine x-data component "${m.name}" could not be found in the workspace.`,
				);
				md.supportThemeIcons = true;
				return new vscode.Hover(md, range);
			}

			const fileUri = files[0];
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
			const relativePath = workspaceFolder
				? vscode.workspace.asRelativePath(fileUri)
				: fileUri.path;
			md.appendMarkdown(`${relativePath}`);

			return new vscode.Hover(md, range);
		}

		return undefined;
	}
}
