package com.intellbank.util;

import java.util.*;
import java.util.regex.*;
import java.util.stream.*;

/**
 * Converts raw OCR question text into structured HTML for the workspace editor.
 *
 * Handles:
 *  - Sub-question indentation:  a), b), (i), (ii), (iii) …
 *  - SPM-style task tables with Predecessor:  Task ID / Task Name / Duration / Predecessor
 *  - SPM-style task tables without Predecessor: Task ID / Task Name / Duration
 *  - Cost/status tables: Task ID / Duration / Cost(RM) / Completion Status(%)
 *  - Table label highlighting:  "Table 1:" / "Table 2 shows…"
 *  - Google-Docs-style paragraph formatting (justified, 1.6 line-height)
 */
public class QuestionHtmlFormatter {

    // ── Pre-processing patterns ───────────────────────────────────────────────

    // Lone marker on its own line ("a)\n") → joined with content on next line ("a) ")
    private static final Pattern LONE_MARKER = Pattern.compile(
        "(?m)^([ \\t]*)(\\(?[a-z]{1,3}[).)]|\\(?[ivx]{1,5}[).)])[ \\t]*\\n([ \\t]*)",
        Pattern.MULTILINE
    );

    // Marker touching content with no space: "a)Identify" → "a) Identify"
    private static final Pattern NO_SPACE_MARKER = Pattern.compile(
        "(\\([a-z]{1,3}\\)|\\([ivx]{1,5}\\)|(?<![A-Za-z])[a-z]{1,3}[).]|(?<![A-Za-z])[ivx]{1,5}[).])(?=[A-Za-z0-9])"
    );

    // ── Sub-question detection ────────────────────────────────────────────────

    // Group 1 captures the marker itself: (a), a), a.  /  (i), ii), ii.  Also (A), A), C) uppercase.
    // After the marker: allows an optional newline (marker on its own line) and content starts.
    private static final Pattern SUB_Q = Pattern.compile(
        "(?:" +
        "(?<=[.!?;:,])[ \\t]+" +
        "|(?<=\\n)[ \\t]*" +
        "|^[ \\t]*" +
        "|(?<=[ \\t])(?=\\([a-zA-Z]{1,3}\\)|\\([ivxIVX]{1,5}\\))" +
        "|(?<=[ \\t])(?=[ivx]{2,5}[).][ \\t])" +
        "|(?<=[ \\t])(?=[A-Z][).][ \\t])" +
        ")" +
        "(\\([a-zA-Z]{1,3}\\)|\\([ivxIVX]{1,5}\\)|[a-z]{1,3}[).]|[A-Z][).]|[ivx]{1,5}[).])" +
        "[ \\t]*\\n?[ \\t]*(?=[A-Za-z'\"(0-9])",
        Pattern.MULTILINE
    );

    // ── Table patterns ────────────────────────────────────────────────────────

    private static final Pattern TASK_TABLE = Pattern.compile(
        "Task\\s+ID\\s+Task\\s+Name\\s+(.+?)\\s+Duration\\s*\\(in\\s+weeks\\)\\s*([\\d,\\s]+?)\\s*Predecessor\\s+(.+?)(?=[\\n(]|$)",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    private static final Pattern TASK_TABLE_NO_PRED = Pattern.compile(
        "Task\\s+ID\\s+Task\\s+Name\\s+(.+?)\\s+Duration\\s*\\(in\\s+weeks\\)\\s*([\\d,\\s]+?)\\s*(?=Total\\b|$)",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    // Handles: "Status (%)", "Completion Status (%)", "Status (percent completed)", etc.
    private static final Pattern COST_TABLE = Pattern.compile(
        "Task\\s+ID\\s+" +
        "(?:Estimated\\s+)?Duration\\s*\\((?:in\\s+)?weeks?\\)\\s+" +
        "(?:Estimated\\s+)?Cost\\s*\\(RM\\)\\s+" +
        "(?:Completion\\s+)?Status\\s*\\([^)]*\\)\\s+" +
        "(.+?)(?=Total\\b|$)",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    private static final Pattern TABLE_LABEL = Pattern.compile(
        "\\b(Table\\s+\\d+(?:\\s*:\\s*[^.(\\n]+)?)",
        Pattern.CASE_INSENSITIVE
    );

    // ── Shared CSS tokens ─────────────────────────────────────────────────────

    private static final String P_STYLE   = "margin-bottom:0.8rem;line-height:1.6;text-align:justify;";
    private static final String TH_STYLE  = "border:1px solid #475569;padding:7px 10px;text-align:left;";
    private static final String TD_STYLE  = "border:1px solid #e2e8f0;padding:6px 10px;";

    // Marks annotation at end of sub-question: "(7 marks)", "(3 + 4 marks)", "[6 marks]"
    private static final Pattern MARKS_ANNOTATION = Pattern.compile(
        "[\\[(]\\s*(\\d+(?:\\s*[+]\\s*\\d+)*)\\s*marks?\\s*[\\])]\\s*$",
        Pattern.CASE_INSENSITIVE
    );

    // ── Public entry point ────────────────────────────────────────────────────

    private static String preprocess(String text) {
        text = LONE_MARKER   .matcher(text).replaceAll("$1$2 ");
        text = NO_SPACE_MARKER.matcher(text).replaceAll("$1 ");
        return text;
    }

    /** Strips university boilerplate: ALL-CAPS header lines, course codes, exam instructions. */
    private static String stripBoilerplate(String text) {
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            String t = line.trim();
            if (t.isEmpty()) { sb.append("\n"); continue; }
            // ALL-CAPS lines with no digits = faculty/university headers (e.g. "FACULTY OF COMPUTING")
            if (t.length() > 5 && t.equals(t.toUpperCase()) && t.matches("[A-Z][A-Z\\s(),.&'-]+")) continue;
            // Course code lines: BAIT3153, CS101, BAIT 3153 etc.
            if (t.matches("[A-Z]{2,6}\\s?\\d{3,4}\\w*.*")) continue;
            // Standard boilerplate phrases
            String lc = t.toLowerCase();
            if (lc.startsWith("this question paper") || lc.startsWith("answer all") ||
                lc.startsWith("time allowed")        || lc.startsWith("duration:") ||
                lc.startsWith("semester ")           || lc.startsWith("academic year") ||
                lc.startsWith("final examination")   || lc.startsWith("mid-term")) continue;
            sb.append(line).append("\n");
        }
        return sb.toString().trim();
    }

    public static String format(String raw) {
        if (raw == null || raw.isBlank()) return "";

        // Explicit [TABLE]…[/TABLE] grid from the OCR pipeline — render directly.
        // Must run BEFORE stripBoilerplate (which would drop all-caps table rows).
        int tableStart = raw.indexOf("[TABLE]");
        if (tableStart >= 0) {
            int tableEnd = raw.indexOf("[/TABLE]", tableStart);
            if (tableEnd > tableStart) {
                String before = raw.substring(0, tableStart);
                String body   = raw.substring(tableStart + "[TABLE]".length(), tableEnd);
                String after  = raw.substring(tableEnd + "[/TABLE]".length());
                return format(before) + renderPipeTable(body) + format(after);
            }
        }

        String text = stripBoilerplate(preprocess(raw.trim()));

        // Row-by-row table parser (matches OCR output format — try first)
        String rowResult = tryRowByRowTable(text);
        if (rowResult != null) return rowResult;

        // Fallback: column-by-column regex (original format)
        Matcher cm = COST_TABLE.matcher(text);
        if (cm.find()) {
            String costHtml = buildCostTable(cm.group(1));
            if (costHtml != null) {
                return renderSubQuestions(text.substring(0, cm.start()))
                     + costHtml
                     + (text.substring(cm.end()).isBlank() ? "" : renderSubQuestions(text.substring(cm.end())));
            }
        }

        Matcher tm = TASK_TABLE.matcher(text);
        if (tm.find()) {
            String tHtml = buildTaskTable(tm.group(1), tm.group(2), tm.group(3));
            if (tHtml != null) {
                return renderSubQuestions(text.substring(0, tm.start()))
                     + tHtml
                     + (text.substring(tm.end()).isBlank() ? "" : renderSubQuestions(text.substring(tm.end())));
            }
        }

        Matcher tnm = TASK_TABLE_NO_PRED.matcher(text);
        if (tnm.find()) {
            String tHtml = buildTaskTableNoPred(tnm.group(1), tnm.group(2));
            if (tHtml != null) {
                return renderSubQuestions(text.substring(0, tnm.start()))
                     + tHtml
                     + (text.substring(tnm.end()).isBlank() ? "" : renderSubQuestions(text.substring(tnm.end())));
            }
        }

        return renderSubQuestions(text);
    }

    // ── Pipe-delimited table renderer (from the [TABLE] OCR format) ────────────
    // The OCR pipeline detects grid lines and emits one row per line, cells
    // separated by " | ". The first row is the header. Because Python already
    // mapped the grid, column alignment is preserved even where a cell is blank.

    private static String renderPipeTable(String body) {
        List<String[]> cells = new ArrayList<>();
        for (String line : body.trim().split("\n")) {
            String r = line.trim();
            if (r.isEmpty()) continue;
            cells.add(r.split("\\s*\\|\\s*", -1));
        }
        if (cells.isEmpty()) return "";

        int ncol = 0;
        for (String[] row : cells) ncol = Math.max(ncol, row.length);
        if (ncol < 2) return "";   // not really a table — let caller treat as text

        StringBuilder t = new StringBuilder();
        t.append("<div style=\"overflow-x:auto;margin:1rem 0 1.5rem 0;\">")
         .append("<table style=\"width:100%;border-collapse:collapse;font-size:0.88rem;\">");

        // Header row
        String[] header = cells.get(0);
        t.append("<thead><tr style=\"background:#334155;color:#fff;\">");
        for (int c = 0; c < ncol; c++) {
            String h = c < header.length ? header[c].trim() : "";
            t.append("<th style=\"").append(TH_STYLE).append("\">").append(escapeHtml(h)).append("</th>");
        }
        t.append("</tr></thead><tbody>");

        // Body rows
        for (int i = 1; i < cells.size(); i++) {
            String[] row = cells.get(i);
            String bg = (i % 2 == 1) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">");
            for (int c = 0; c < ncol; c++) {
                String v = c < row.length ? row[c].trim() : "";
                String align = v.matches("[\\d.,%RM\\s]+") && !v.isBlank() ? "text-align:right;" : "";
                t.append("<td style=\"").append(TD_STYLE).append(align).append("\">")
                 .append(escapeHtml(v)).append("</td>");
            }
            t.append("</tr>");
        }
        t.append("</tbody></table></div>");
        return t.toString();
    }

    private static String escapeHtml(String s) {
        if (s == null || s.isEmpty()) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    // ── Row-by-row OCR table parser ───────────────────────────────────────────
    // OCR scans left-to-right top-to-bottom, so table rows come out as:
    //   Task ID Task Name Duration (in weeks) Predecessor
    //   A Project planning 1 None
    //   B Feasibility study 1 A

    private static String tryRowByRowTable(String text) {
        String[] lines = text.split("\n");

        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].toLowerCase().contains("task id")) continue;

            // Collect header (may span 1-2 lines when OCR wraps column names)
            StringBuilder headerBuf = new StringBuilder(lines[i]);
            int dataStart = i + 1;
            while (dataStart < lines.length) {
                String candidate = lines[dataStart].trim();
                if (candidate.isEmpty()) { dataStart++; continue; }
                if (isTaskDataRow(candidate)) break;
                headerBuf.append(" ").append(candidate);
                dataStart++;
            }

            String header = headerBuf.toString().toLowerCase();
            boolean hasPred = header.contains("predecessor");
            boolean hasCost = header.contains("cost");

            // Try full-format rows first (each row has inline duration/predecessor)
            List<String[]> rows = new ArrayList<>();
            int j = dataStart;
            for (; j < lines.length; j++) {
                String rowLine = lines[j].trim();
                if (rowLine.isEmpty()) continue;
                String[] row = hasCost ? parseCostDataRow(rowLine) : parseTaskDataRow(rowLine, hasPred);
                if (row == null) break;
                rows.add(row);
            }

            // Hybrid format: rows contain only task name, duration/predecessor in separate lines below
            if (rows.isEmpty()) {
                List<String[]> nameRows = new ArrayList<>();
                int ki = dataStart;
                for (; ki < lines.length; ki++) {
                    String rowLine = lines[ki].trim();
                    if (rowLine.isEmpty()) continue;
                    if (!isTaskDataRow(rowLine)) break;
                    String taskId   = String.valueOf(rowLine.charAt(0));
                    String taskName = rowLine.substring(1).trim();
                    if (taskName.isEmpty()) break;
                    nameRows.add(new String[]{taskId, taskName});
                }
                if (!nameRows.isEmpty()) {
                    String[] durations = new String[nameRows.size()];
                    Arrays.fill(durations, "—");
                    String[] preds = new String[nameRows.size()];
                    Arrays.fill(preds, "None");

                    int m = ki;
                    while (m < lines.length) {
                        String ln = lines[m].trim();
                        if (ln.isEmpty()) { m++; continue; }
                        // Duration line: sequence of 1-2 digit numbers separated by spaces/commas
                        if (ln.matches("\\d{1,2}([\\s,]+\\d{1,2})*")) {
                            String[] nums = ln.split("[\\s,]+");
                            for (int n = 0; n < Math.min(nums.length, durations.length); n++) {
                                if (!nums[n].isEmpty()) durations[n] = nums[n];
                            }
                            m++;
                        } else if (isPredecessorLine(ln)) {
                            List<String> predList = parsePredecessorLine(ln);
                            for (int n = 0; n < Math.min(predList.size(), preds.length); n++) {
                                preds[n] = predList.get(n);
                            }
                            m++;
                        } else {
                            break;
                        }
                    }
                    j = m;

                    for (int n = 0; n < nameRows.size(); n++) {
                        if (hasPred) {
                            rows.add(new String[]{nameRows.get(n)[0], nameRows.get(n)[1], durations[n], preds[n]});
                        } else {
                            rows.add(new String[]{nameRows.get(n)[0], nameRows.get(n)[1], durations[n]});
                        }
                    }
                }
            }

            if (rows.isEmpty()) continue;

            String before = IntStream.range(0, i).mapToObj(k -> lines[k]).collect(Collectors.joining("\n"));
            String after  = j < lines.length
                    ? IntStream.range(j, lines.length).mapToObj(k -> lines[k]).collect(Collectors.joining("\n"))
                    : "";

            String tableHtml = hasCost ? buildCostTableFromRows(rows) : buildTaskTableFromRows(rows, hasPred);

            return (before.isBlank() ? "" : renderSubQuestions(before))
                 + tableHtml
                 + (after.isBlank() ? "" : renderSubQuestions(after));
        }

        return null;
    }

    /** True if every space-separated token is "None" or a single uppercase letter (optionally comma-suffixed). */
    private static boolean isPredecessorLine(String line) {
        String[] tokens = line.trim().split("\\s+");
        if (tokens.length < 2) return false;
        for (String token : tokens) {
            String t = token.replace(",", "").trim();
            if (!t.equalsIgnoreCase("None") && !t.matches("[A-Z]")) return false;
        }
        return true;
    }

    /**
     * Parses "None A B C C D, E F" into ["None","A","B","C","C","D, E","F"].
     * Tokens ending with comma are joined with the next token as a multi-predecessor.
     */
    private static List<String> parsePredecessorLine(String line) {
        List<String> result = new ArrayList<>();
        String[] tokens = line.trim().split("\\s+");
        String current = "";
        for (String token : tokens) {
            if (token.endsWith(",")) {
                String t = token.substring(0, token.length() - 1);
                current = current.isEmpty() ? t : current + ", " + t;
            } else if (!current.isEmpty()) {
                result.add(current + ", " + token);
                current = "";
            } else {
                result.add(token.equalsIgnoreCase("None") ? "None" : token);
            }
        }
        if (!current.isEmpty()) result.add(current);
        return result;
    }

    /** Returns true if the line looks like a task/cost table data row (single uppercase letter then space). */
    private static boolean isTaskDataRow(String line) {
        return line.length() >= 2 && Character.isUpperCase(line.charAt(0)) && Character.isWhitespace(line.charAt(1));
    }

    /**
     * Parses a task table row: "A Project planning 1 None" or "F Testing 2 D, E"
     * Strategy: task ID = first char, duration = LAST standalone 1-2 digit number,
     * task name = text between ID and duration, predecessor = everything after duration.
     */
    private static String[] parseTaskDataRow(String line, boolean hasPred) {
        if (!isTaskDataRow(line)) return null;
        String taskId = String.valueOf(line.charAt(0));
        String rest   = line.substring(1).trim();

        // Find the last standalone small number (duration in weeks, typically 1–20)
        Matcher m = Pattern.compile("\\b(\\d{1,2})\\b").matcher(rest);
        int lastStart = -1, lastEnd = -1;
        while (m.find()) {
            lastStart = m.start();
            lastEnd   = m.end();
        }
        if (lastStart < 0) return null;

        String taskName = rest.substring(0, lastStart).trim();
        String duration = rest.substring(lastStart, lastEnd).trim();
        String pred     = rest.substring(lastEnd).trim();

        if (taskName.isEmpty()) return null;
        if (pred.isEmpty() || pred.equals("-") || pred.equals("—")) pred = "None";

        return hasPred ? new String[]{taskId, taskName, duration, pred}
                       : new String[]{taskId, taskName, duration};
    }

    /**
     * Parses a cost/status table row: "A 3 24,000 30" or "B 4 18,500 50%"
     * Columns: Task ID | Duration (wks) | Cost (RM) | Status (%)
     */
    private static String[] parseCostDataRow(String line) {
        if (!isTaskDataRow(line)) return null;
        String taskId = String.valueOf(line.charAt(0));
        String rest   = line.substring(1).trim();

        Matcher sm = Pattern.compile("(\\d+)%?\\s*$").matcher(rest);
        String status = sm.find() ? sm.group(1) + "%" : "—";

        String withoutStatus = rest.replaceFirst("\\d+%?\\s*$", "").trim();

        Matcher cm = Pattern.compile("(\\d{1,3}(?:,\\d{3})+)").matcher(withoutStatus);
        String cost = cm.find() ? cm.group(1) : "—";

        String remaining = withoutStatus.replaceFirst("\\d{1,3}(?:,\\d{3})+", "").trim();
        Matcher dm = Pattern.compile("\\b(\\d{1,2})\\b").matcher(remaining);
        String duration = dm.find() ? dm.group(1) : "—";

        if (duration.equals("—") && cost.equals("—")) return null;
        return new String[]{taskId, duration, cost, status};
    }

    private static String buildTaskTableFromRows(List<String[]> rows, boolean hasPred) {
        StringBuilder t = new StringBuilder();
        t.append("<div style=\"overflow-x:auto;margin:1rem 0 1.5rem 0;\">")
         .append("<table style=\"width:100%;border-collapse:collapse;font-size:0.88rem;\">")
         .append("<thead><tr style=\"background:#334155;color:#fff;\">")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Task ID</th>")
         .append("<th style=\"").append(TH_STYLE).append("\">Task Name</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Duration (wks)</th>");
        if (hasPred) t.append("<th style=\"").append(TH_STYLE).append("\">Predecessor</th>");
        t.append("</tr></thead><tbody>");

        for (int i = 0; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String bg = (i % 2 == 0) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;font-weight:600;\">").append(row[0]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("\">").append(row[1]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">").append(row[2]).append("</td>");
            if (hasPred) t.append("<td style=\"").append(TD_STYLE).append("\">").append(row.length > 3 ? row[3] : "—").append("</td>");
            t.append("</tr>");
        }
        t.append("</tbody></table></div>");
        return t.toString();
    }

    private static String buildCostTableFromRows(List<String[]> rows) {
        StringBuilder t = new StringBuilder();
        t.append("<div style=\"overflow-x:auto;margin:1rem 0 1.5rem 0;\">")
         .append("<table style=\"width:100%;border-collapse:collapse;font-size:0.88rem;\">")
         .append("<thead><tr style=\"background:#334155;color:#fff;\">")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Task ID</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Duration (wks)</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:right;\">Cost (RM)</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Status</th>")
         .append("</tr></thead><tbody>");

        for (int i = 0; i < rows.size(); i++) {
            String[] row = rows.get(i);
            String bg = (i % 2 == 0) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;font-weight:600;\">").append(row[0]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">").append(row[1]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:right;\">").append(row[2]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">").append(row[3]).append("</td>")
             .append("</tr>");
        }
        t.append("</tbody></table></div>");
        return t.toString();
    }

    // ── Sub-question renderer ─────────────────────────────────────────────────

    private static String renderSubQuestions(String text) {
        if (text == null || text.isBlank()) return "";
        text = text.trim();

        Matcher m = SUB_Q.matcher(text);

        List<int[]>  bounds  = new ArrayList<>();
        List<String> markers = new ArrayList<>();
        while (m.find()) {
            bounds.add(new int[]{ m.start(), m.end() });
            markers.add(m.group(1));
        }

        if (bounds.isEmpty()) {
            return paragraphs(highlightLabel(text));
        }

        StringBuilder html = new StringBuilder();
        int pos = 0;

        for (int i = 0; i < bounds.size(); i++) {
            // Stem text before this marker
            String segment = text.substring(pos, bounds.get(i)[0]).trim();
            if (!segment.isEmpty()) {
                html.append(paragraphs(highlightLabel(segment)));
            }

            int    contentStart = bounds.get(i)[1];
            int    contentEnd   = (i + 1 < bounds.size()) ? bounds.get(i + 1)[0] : text.length();
            String content      = text.substring(contentStart, contentEnd).trim();
            String marker       = markers.get(i);
            boolean roman       = marker.matches("\\([ivx]+\\)");
            String  ml          = roman ? "2.5rem" : "1.5rem";

            // Sub-question styling: flat <p> elements (no wrapper div) so the pagination
            // engine can move individual paragraphs between pages.
            String subStyle = "margin-left:" + ml + ";margin-bottom:0.6rem;padding-left:0.75rem;"
                + "line-height:1.6;text-align:justify;"
                + "word-wrap:break-word;overflow-wrap:break-word;";

            // Split multi-paragraph sub-question content so each paragraph is its own node
            String[] paras = content.split("\\n{2,}");

            // Detect trailing marks annotation for right-aligned display: (7 marks), [3 + 4 marks]
            String firstPara = paras[0].trim().replace("\n", " ");
            String marksSpan = "";
            Matcher mm = MARKS_ANNOTATION.matcher(firstPara);
            if (mm.find()) {
                marksSpan = "<span style=\"float:right;font-style:italic;font-size:0.85rem;color:#475569;white-space:nowrap;\">"
                          + mm.group().trim() + "</span>";
                firstPara = firstPara.substring(0, mm.start()).trim();
            }

            // First paragraph carries the marker label (float:right span must come first in HTML)
            html.append("<p style=\"").append(subStyle).append("\">")
                .append(marksSpan)
                .append("<strong style=\"color:#334155;\">").append(marker).append("</strong>&nbsp;")
                .append(firstPara)
                .append("</p>");
            // Continuation paragraphs (same indent, no bold marker)
            for (int j = 1; j < paras.length; j++) {
                String para = paras[j].trim();
                if (!para.isEmpty()) {
                    html.append("<p style=\"").append(subStyle).append("\">")
                        .append(para.replace("\n", " "))
                        .append("</p>");
                }
            }

            pos = contentEnd;
        }

        return html.toString();
    }

    /** Wraps multi-paragraph plain text in individual <p> tags. */
    private static String paragraphs(String text) {
        String[] chunks = text.split("\\n{2,}");
        StringBuilder sb = new StringBuilder();
        for (String chunk : chunks) {
            String t = chunk.trim();
            if (!t.isEmpty()) {
                sb.append("<p style=\"").append(P_STYLE).append("\">")
                  .append(t.replace("\n", " "))
                  .append("</p>");
            }
        }
        if (sb.length() == 0) {
            sb.append("<p style=\"").append(P_STYLE).append("\">").append(text.replace("\n", " ")).append("</p>");
        }
        return sb.toString();
    }

    private static String highlightLabel(String text) {
        return TABLE_LABEL.matcher(text).replaceAll(
            r -> "<strong><em>" + Matcher.quoteReplacement(r.group(1)) + "</em></strong>"
        );
    }

    // ── Task table builder (with Predecessor) ─────────────────────────────────

    /** Returns null if parsing produces no usable rows (caller falls back to plain text). */
    private static String buildTaskTable(String namesBlock, String durBlock, String predsBlock) {
        List<String[]> tasks = parseTaskNames(namesBlock);
        if (tasks.isEmpty()) return null;

        String[]     durs  = durBlock.trim().split("[,\\s]+");
        List<String> preds = parsePredecessors(predsBlock);

        StringBuilder t = new StringBuilder();
        t.append("<div style=\"overflow-x:auto;margin:1rem 0 1.5rem 0;\">")
         .append("<table style=\"width:100%;border-collapse:collapse;font-size:0.88rem;\">")
         .append("<thead><tr style=\"background:#334155;color:#fff;\">")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Task ID</th>")
         .append("<th style=\"").append(TH_STYLE).append("\">Task Name</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Duration (wks)</th>")
         .append("<th style=\"").append(TH_STYLE).append("\">Predecessor</th>")
         .append("</tr></thead><tbody>");

        for (int i = 0; i < tasks.size(); i++) {
            String bg = (i % 2 == 0) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;font-weight:600;\">")
             .append(tasks.get(i)[0]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("\">").append(tasks.get(i)[1]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">")
             .append(i < durs.length ? durs[i] : "—").append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("\">")
             .append(i < preds.size() ? preds.get(i) : "—").append("</td>")
             .append("</tr>");
        }
        t.append("</tbody></table></div>");
        return t.toString();
    }

    // ── Task table builder (without Predecessor) ──────────────────────────────

    private static String buildTaskTableNoPred(String namesBlock, String durBlock) {
        List<String[]> tasks = parseTaskNames(namesBlock);
        if (tasks.isEmpty()) return null;

        String[] durs = durBlock.trim().split("[,\\s]+");

        StringBuilder t = new StringBuilder();
        t.append("<div style=\"overflow-x:auto;margin:1rem 0 1.5rem 0;\">")
         .append("<table style=\"width:100%;border-collapse:collapse;font-size:0.88rem;\">")
         .append("<thead><tr style=\"background:#334155;color:#fff;\">")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Task ID</th>")
         .append("<th style=\"").append(TH_STYLE).append("\">Task Name</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Duration (wks)</th>")
         .append("</tr></thead><tbody>");

        for (int i = 0; i < tasks.size(); i++) {
            String bg = (i % 2 == 0) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;font-weight:600;\">")
             .append(tasks.get(i)[0]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("\">").append(tasks.get(i)[1]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">")
             .append(i < durs.length ? durs[i] : "—").append("</td>")
             .append("</tr>");
        }
        t.append("</tbody></table></div>");
        return t.toString();
    }

    // ── Cost/status table builder ─────────────────────────────────────────────

    /** Returns null if parsing produces no rows with real data (caller falls back to plain text). */
    private static String buildCostTable(String dataBlock) {
        Pattern idPat = Pattern.compile("(?:^|(?<=\\s))([A-Z])(?=\\s)");
        Matcher m = idPat.matcher(dataBlock);

        List<int[]>  pos = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        while (m.find()) {
            pos.add(new int[]{ m.start(), m.end() });
            ids.add(m.group(1));
        }

        List<String[]> rows = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            int valStart = pos.get(i)[1];
            int valEnd   = (i + 1 < pos.size()) ? pos.get(i + 1)[0] : dataBlock.length();
            String[] vals = parseRowValues(dataBlock.substring(valStart, valEnd));
            rows.add(new String[]{ ids.get(i), vals[0], vals[1], vals[2] });
        }

        // Validate: need at least 2 rows with some real data
        long usable = rows.stream()
                .filter(r -> !r[1].equals("—") || !r[2].equals("—") || !r[3].equals("—"))
                .count();
        if (rows.isEmpty() || usable < 2) return null;

        StringBuilder t = new StringBuilder();
        t.append("<div style=\"overflow-x:auto;margin:1rem 0 1.5rem 0;\">")
         .append("<table style=\"width:100%;border-collapse:collapse;font-size:0.88rem;\">")
         .append("<thead><tr style=\"background:#334155;color:#fff;\">")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Task ID</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Duration (wks)</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:right;\">Cost (RM)</th>")
         .append("<th style=\"").append(TH_STYLE).append("text-align:center;\">Status</th>")
         .append("</tr></thead><tbody>");

        for (int i = 0; i < rows.size(); i++) {
            String bg = (i % 2 == 0) ? "#f8fafc" : "#ffffff";
            t.append("<tr style=\"background:").append(bg).append(";\">")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;font-weight:600;\">")
             .append(rows.get(i)[0]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">")
             .append(rows.get(i)[1]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:right;\">")
             .append(rows.get(i)[2]).append("</td>")
             .append("<td style=\"").append(TD_STYLE).append("text-align:center;\">")
             .append(rows.get(i)[3]).append("</td>")
             .append("</tr>");
        }
        t.append("</tbody></table></div>");
        return t.toString();
    }

    private static String[] parseRowValues(String block) {
        String dur = "—", cost = "—", status = "—";
        Matcher sm = Pattern.compile("(\\d+)%").matcher(block);
        if (sm.find()) status = sm.group(1) + "%";
        Matcher cm = Pattern.compile("(\\d{1,3}(?:,\\d{3})+)").matcher(block);
        if (cm.find()) cost = cm.group(1);
        String remaining = block.replaceAll("\\d+%", "").replaceAll("\\d{1,3}(?:,\\d{3})+", "").trim();
        Matcher dm = Pattern.compile("\\b(\\d{1,2})\\b").matcher(remaining);
        if (dm.find()) dur = dm.group(1);
        return new String[]{ dur, cost, status };
    }

    // ── Shared parsers ────────────────────────────────────────────────────────

    private static List<String[]> parseTaskNames(String block) {
        List<String[]> result = new ArrayList<>();
        Pattern idPat = Pattern.compile("(?:^|(?<=\\s))([A-Z])(?=\\s)");
        Matcher m     = idPat.matcher(block);
        List<int[]>  pos = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        while (m.find()) {
            pos.add(new int[]{ m.start(), m.end() });
            ids.add(m.group(1));
        }
        for (int i = 0; i < pos.size(); i++) {
            int nameStart = pos.get(i)[1] + 1;
            int nameEnd   = (i + 1 < pos.size()) ? pos.get(i + 1)[0] - 1 : block.length();
            nameStart = Math.min(nameStart, block.length());
            nameEnd   = Math.max(nameStart, Math.min(nameEnd, block.length()));
            String name = block.substring(nameStart, nameEnd).trim();
            if (!name.isEmpty()) result.add(new String[]{ ids.get(i), name });
        }
        return result;
    }

    private static List<String> parsePredecessors(String block) {
        List<String> result = new ArrayList<>();
        Pattern p = Pattern.compile("None|N(?=\\s|$)|—|-{1,3}|[A-Z](?:\\s*,\\s*[A-Z])*");
        Matcher m = p.matcher(block);
        while (m.find()) {
            String val = m.group().trim();
            if (val.equals("N") || val.startsWith("-") || val.equals("—")) val = "None";
            result.add(val);
        }
        return result;
    }
}