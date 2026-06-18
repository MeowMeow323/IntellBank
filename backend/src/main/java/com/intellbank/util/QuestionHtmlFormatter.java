package com.intellbank.util;

import java.util.*;
import java.util.regex.*;

/**
 * Converts raw OCR question text into structured HTML for the workspace editor.
 *
 * Handles:
 *  - Sub-question indentation:  a), b), (i), (ii), (iii) …
 *  - SPM-style task tables:     Task ID / Task Name / Duration / Predecessor
 *  - Table label highlighting:  "Table 1:" / "Table 2 shows…"
 *  - Generic paragraph spacing
 */
public class QuestionHtmlFormatter {

    // Sub-question split: marker that follows sentence-ending punctuation
    // Group 1 = the marker itself (a), b), (i), (ii) …)
    private static final Pattern SUB_Q = Pattern.compile(
        "(?<=[.!?])\\s+(\\([a-z]{1,2}\\)|\\([ivx]{1,4}\\)|[a-z]\\))\\s+(?=[A-Z'\"(])"
    );

    // SPM task table embedded in OCR: "Task ID Task Name A … Duration (in weeks) … Predecessor …"
    private static final Pattern TASK_TABLE = Pattern.compile(
        "Task\\s+ID\\s+Task\\s+Name\\s+(.+?)\\s+Duration\\s*\\(in\\s*weeks\\)\\s*([\\d,\\s]+?)\\s*Predecessor\\s+(.+?)(?=[\\n(]|\\s{2,}|[A-Z][a-z]{2,}\\s+[a-z]|$)",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    // Highlight "Table N:" / "Table N shows" labels
    private static final Pattern TABLE_LABEL = Pattern.compile(
        "\\b(Table\\s+\\d+(?:\\s*:\\s*[^.(\\n]+)?)",
        Pattern.CASE_INSENSITIVE
    );

    // ── Public entry point ────────────────────────────────────────────────────

    public static String format(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String text = raw.trim();

        Matcher tm = TASK_TABLE.matcher(text);
        if (!tm.find()) {
            return renderSubQuestions(text);
        }

        String before    = text.substring(0, tm.start());
        String tableHtml = buildTaskTable(tm.group(1), tm.group(2), tm.group(3));
        String after     = text.substring(tm.end());

        return renderSubQuestions(before)
             + tableHtml
             + (after.isBlank() ? "" : renderSubQuestions(after));
    }

    // ── Sub-question renderer ─────────────────────────────────────────────────

    private static String renderSubQuestions(String text) {
        if (text == null || text.isBlank()) return "";
        text = text.trim();

        Matcher m = SUB_Q.matcher(text);

        // Collect split boundaries
        List<int[]>  bounds  = new ArrayList<>();   // [matchStart, matchEnd]
        List<String> markers = new ArrayList<>();

        while (m.find()) {
            bounds.add(new int[]{ m.start(), m.end() });
            markers.add(m.group(1));
        }

        if (bounds.isEmpty()) {
            // No sub-questions – single paragraph
            return "<p style=\"margin-bottom:0.75rem;line-height:1.8;\">"
                 + highlightLabel(text) + "</p>";
        }

        StringBuilder html = new StringBuilder();
        int pos = 0;

        for (int i = 0; i < bounds.size(); i++) {
            int segEnd = bounds.get(i)[0];

            // Text before this marker
            String segment = text.substring(pos, segEnd).trim();
            if (!segment.isEmpty()) {
                html.append("<p style=\"margin-bottom:0.75rem;line-height:1.8;\">")
                    .append(highlightLabel(segment))
                    .append("</p>");
            }

            // Content belonging to this marker (up to next marker, or end)
            int contentStart = bounds.get(i)[1];
            int contentEnd   = (i + 1 < bounds.size()) ? bounds.get(i + 1)[0] : text.length();
            String content   = text.substring(contentStart, contentEnd).trim();
            String marker    = markers.get(i);
            boolean roman    = marker.matches("\\([ivx]+\\)");
            String  ml       = roman ? "2.5rem" : "1.5rem";

            html.append("<div style=\"margin-left:").append(ml)
                .append(";margin-bottom:0.75rem;border-left:3px solid #cbd5e1;padding-left:0.75rem;\">")
                .append("<p style=\"margin:0;line-height:1.8;\">")
                .append("<strong style=\"color:#1e293b;\">").append(marker).append("</strong>&nbsp;")
                .append(content)
                .append("</p></div>");

            pos = contentEnd;
        }

        return html.toString();
    }

    private static String highlightLabel(String text) {
        return TABLE_LABEL.matcher(text).replaceAll(
            r -> "<strong><em>" + Matcher.quoteReplacement(r.group(1)) + "</em></strong>"
        );
    }

    // ── Task table builder ────────────────────────────────────────────────────

    private static String buildTaskTable(String namesBlock, String durBlock, String predsBlock) {
        List<String[]> tasks = parseTaskNames(namesBlock);
        String[]       durs  = durBlock.trim().split("[,\\s]+");
        List<String>   preds = parsePredecessors(predsBlock);

        if (tasks.isEmpty()) {
            // Graceful fallback: monospace box
            return "<div style=\"font-family:monospace;font-size:0.82rem;background:#f8fafc;"
                 + "border:1px solid #e2e8f0;padding:1rem;margin:1rem 0;border-radius:4px;"
                 + "white-space:pre-wrap;overflow-x:auto;\"><strong>Task Table</strong>\n"
                 + namesBlock + "\nDuration (in weeks): " + durBlock
                 + "\nPredecessor: " + predsBlock + "</div>";
        }

        StringBuilder t = new StringBuilder();
        t.append("<table style=\"width:100%;border-collapse:collapse;margin:1rem 0 1.5rem 0;font-size:0.85rem;\">")
         .append("<caption style=\"font-weight:700;text-align:left;padding-bottom:6px;font-size:0.9rem;\">")
         .append("Task Schedule</caption>")
         .append("<thead><tr style=\"background:#1e293b;color:#fff;\">")
         .append("<th style=\"border:1px solid #475569;padding:7px 12px;\">Task ID</th>")
         .append("<th style=\"border:1px solid #475569;padding:7px 12px;\">Task Name</th>")
         .append("<th style=\"border:1px solid #475569;padding:7px 12px;text-align:center;\">Duration&nbsp;(wks)</th>")
         .append("<th style=\"border:1px solid #475569;padding:7px 12px;\">Predecessor</th>")
         .append("</tr></thead><tbody>");

        for (int i = 0; i < tasks.size(); i++) {
            String bg = (i % 2 == 0) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">")
             .append("<td style=\"border:1px solid #e2e8f0;padding:6px 12px;text-align:center;font-weight:700;\">")
             .append(tasks.get(i)[0]).append("</td>")
             .append("<td style=\"border:1px solid #e2e8f0;padding:6px 12px;\">")
             .append(tasks.get(i)[1]).append("</td>")
             .append("<td style=\"border:1px solid #e2e8f0;padding:6px 12px;text-align:center;\">")
             .append(i < durs.length ? durs[i] : "—").append("</td>")
             .append("<td style=\"border:1px solid #e2e8f0;padding:6px 12px;\">")
             .append(i < preds.size() ? preds.get(i) : "—").append("</td>")
             .append("</tr>");
        }
        t.append("</tbody></table>");
        return t.toString();
    }

    /**
     * Parses "A Proposal B Requirements analysis C Design UI and data models D …"
     * into [{A, Proposal}, {B, Requirements analysis}, {C, Design UI and data models}, …]
     *
     * Strategy: every single uppercase letter that is a word on its own (preceded by
     * start-of-string or whitespace, followed by a space) is treated as a Task ID.
     * Task names run from the character after each ID to the character before the next ID.
     */
    private static List<String[]> parseTaskNames(String block) {
        List<String[]> result = new ArrayList<>();
        // Match single uppercase letter that is a whole "word" (not part of an abbreviation)
        Pattern idPat = Pattern.compile("(?:^|(?<=\\s))([A-Z])(?=\\s)");
        Matcher m     = idPat.matcher(block);

        List<int[]>  pos = new ArrayList<>();
        List<String> ids = new ArrayList<>();

        while (m.find()) {
            pos.add(new int[]{ m.start(), m.end() });
            ids.add(m.group(1));
        }

        for (int i = 0; i < pos.size(); i++) {
            int nameStart = pos.get(i)[1] + 1;   // character after the space following the ID
            int nameEnd   = (i + 1 < pos.size()) ? pos.get(i + 1)[0] - 1 : block.length();
            nameStart = Math.min(nameStart, block.length());
            nameEnd   = Math.max(nameStart, Math.min(nameEnd, block.length()));
            String name = block.substring(nameStart, nameEnd).trim();
            if (!name.isEmpty()) {
                result.add(new String[]{ ids.get(i), name });
            }
        }
        return result;
    }

    /**
     * Parses "None A B B, C D E B" into [None, A, B, B,C, D, E, B]
     * Keeps comma-separated combinations like "B, C" as one entry.
     */
    private static List<String> parsePredecessors(String block) {
        List<String> result = new ArrayList<>();
        Pattern p = Pattern.compile("None|[A-Z](?:\\s*,\\s*[A-Z])*");
        Matcher m = p.matcher(block);
        while (m.find()) result.add(m.group().trim());
        return result;
    }
}
