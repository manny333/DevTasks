import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const ACCENT = 'FF2BBFAA';
const ACCENT_DARK = 'FF1E2D40';
const HEADER_BG = 'FF1E2D40';
const HEADER_FG = 'FFFFFFFF';
const ROW_ALT = 'FFF0FBFA';
const WHITE = 'FFFFFFFF';
const DONE_GREEN = 'FF22C55E';
const PROGRESS_AMBER = 'FFF59E0B';
const BORDER_COLOR = 'FFD1D5DB';
const SECTION_COLORS: Record<string, string> = {
  TODO: 'FF94A3B8', IN_PROGRESS: 'FFF59E0B', IN_REVIEW: 'FF6366F1', DONE: 'FF22C55E',
};

const statusLabel: Record<string, string> = {
  TODO: 'To Do', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', DONE: 'Done',
};

function setCell(ws: ExcelJS.Worksheet, row: number, col: number, value: any, style?: Partial<ExcelJS.Style>) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  if (style) {
    if (style.font) cell.font = style.font;
    if (style.fill) cell.fill = style.fill;
    if (style.alignment) cell.alignment = style.alignment;
    if (style.border) cell.border = style.border;
    if (style.numFmt) cell.numFmt = style.numFmt;
  }
}

function addBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER_COLOR } },
    left: { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    right: { style: 'thin', color: { argb: BORDER_COLOR } },
  };
}

const headerStyle = {
  font: { bold: true, color: { argb: HEADER_FG }, size: 11 },
  fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: HEADER_BG } },
  alignment: { vertical: 'middle' as const, horizontal: 'left' as const },
};

const titleStyle = {
  font: { bold: true, size: 14, color: { argb: ACCENT_DARK } },
};

const subtitleStyle = {
  font: { bold: true, size: 12, color: { argb: ACCENT } },
};

// GET /api/projects/:projectId/export
router.get('/:projectId/export', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId as string },
      include: {
        sections: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              where: { archived: false },
              include: {
                tags: { include: { tag: true } },
                assignees: { include: { user: { select: { name: true, email: true } } } },
                subtasks: true,
                _count: { select: { comments: true, subtasks: true } },
              },
            },
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Kanvy';
    wb.created = new Date();

    // ── Summary sheet ──────────────────────────────────
    const summaryWs = wb.addWorksheet('Summary');
    summaryWs.columns = [
      { width: 28 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];

    // Brand header
    setCell(summaryWs, 1, 1, 'Kanvy', {
      font: { bold: true, size: 20, color: { argb: ACCENT } },
    });
    setCell(summaryWs, 1, 2, '');
    summaryWs.mergeCells(1, 1, 1, 4);

    setCell(summaryWs, 2, 1, `Project: ${project.name}`, { font: { bold: true, size: 14 } });
    setCell(summaryWs, 2, 2, '');
    summaryWs.mergeCells(2, 1, 2, 4);

    setCell(summaryWs, 3, 1, `Exported: ${new Date().toLocaleString()}`, {
      font: { italic: true, color: { argb: 'FF6B7280' }, size: 11 },
    });
    setCell(summaryWs, 3, 2, '');
    summaryWs.mergeCells(3, 1, 3, 4);

    // Summary table header
    const headers = ['Section', 'Tasks', 'Done', 'Progress'];
    for (let i = 0; i < headers.length; i++) {
      const cell = summaryWs.getCell(5, i + 1);
      cell.value = headers[i];
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
      addBorder(cell);
    }

    let summaryRow = 6;
    for (const section of project.sections) {
      const tasks = section.tasks.filter(t => !t.archived);
      const done = tasks.filter(t => t.status === 'DONE').length;
      const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

      for (let i = 0; i < 4; i++) {
        const cell = summaryWs.getCell(summaryRow, i + 1);
        cell.value = i === 0 ? section.name : i === 1 ? tasks.length : i === 2 ? done : `${pct}%`;
        if (section.color) cell.font = { color: { argb: section.color.replace('#', 'FF') } };
        if (summaryRow % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } };
        }
        addBorder(cell);
      }

      // Progress bar effect via conditional coloring
      if (pct === 100) {
        summaryWs.getCell(summaryRow, 4).font = { bold: true, color: { argb: DONE_GREEN } };
      } else if (pct >= 50) {
        summaryWs.getCell(summaryRow, 4).font = { color: { argb: PROGRESS_AMBER } };
      }

      summaryRow++;
    }

    // ── Section sheets ─────────────────────────────────
    for (const section of project.sections) {
      const activeTasks = section.tasks.filter(t => !t.archived);
      const sheetName = section.name.replace(/[\\\/\*\?\[\]:]/g, '-').slice(0, 31) || 'Section';
      const ws = wb.addWorksheet(sheetName);

      ws.columns = [
        { width: 42 }, { width: 52 }, { width: 16 }, { width: 14 },
        { width: 14 }, { width: 32 }, { width: 30 }, { width: 14 }, { width: 12 },
      ];

      // Section title
      const sectionColor = section.color.replace('#', 'FF');
      setCell(ws, 1, 1, section.name, {
        font: { bold: true, size: 14, color: { argb: sectionColor } },
      });
      ws.mergeCells(1, 1, 1, 9);

      setCell(ws, 2, 1, `${activeTasks.length} tasks · ${activeTasks.filter(t => t.status === 'DONE').length} done`, {
        font: { italic: true, size: 11, color: { argb: 'FF6B7280' } },
      });
      ws.mergeCells(2, 1, 2, 9);

      // Table headers
      const colHeaders = ['Title', 'Description', 'Status', 'Start Date', 'Due Date', 'Assignees', 'Tags', 'Subtasks', 'Comments'];
      for (let i = 0; i < colHeaders.length; i++) {
        const cell = ws.getCell(4, i + 1);
        cell.value = colHeaders[i];
        cell.font = headerStyle.font;
        cell.fill = headerStyle.fill;
        cell.alignment = headerStyle.alignment;
        addBorder(cell);
      }

      // Task rows
      for (let j = 0; j < activeTasks.length; j++) {
        const task = activeTasks[j];
        const row = 5 + j;
        const isAlt = j % 2 === 1;
        const statusColor = SECTION_COLORS[task.status] || 'FF94A3B8';

        const values = [
          task.title,
          task.description || '',
          statusLabel[task.status] || task.status,
          task.startDate ? new Date(task.startDate).toLocaleDateString() : '',
          task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '',
          task.assignees.map(a => a.user.name || a.user.email).join(', '),
          task.tags.map(t => t.tag.name).join(', '),
          `${(task.subtasks || []).filter(s => s.completed).length}/${task._count.subtasks}`,
          task._count.comments,
        ];

        for (let k = 0; k < values.length; k++) {
          const cell = ws.getCell(row, k + 1);
          cell.value = values[k];
          addBorder(cell);
          if (k === 2) {
            cell.font = { bold: true, color: { argb: statusColor }, size: 10 };
            cell.alignment = { vertical: 'middle' };
          }
          if (isAlt) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT } };
          }
        }
      }
    }

    // ── Write and send ─────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();

    const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_Kanvy_Export.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
