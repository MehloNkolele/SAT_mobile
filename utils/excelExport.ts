import * as XLSX from 'xlsx';
import { Member, Bacenta, AttendanceRecord } from '../types';
import { getSundaysOfMonth, formatDateToYYYYMMDD, getMonthName } from './dateUtils';

export interface ExcelExportOptions {
  includeCharts: boolean;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  selectedBacentas: string[]; // Empty array means all bacentas
  includePersonalInfo: boolean;
}

export interface ExcelData {
  members: Member[];
  bacentas: Bacenta[];
  attendanceRecords: AttendanceRecord[];
  options: ExcelExportOptions;
}

// Helper function to calculate attendance statistics
const calculateAttendanceStats = (
  members: Member[],
  attendanceRecords: AttendanceRecord[],
  dateRange: { startDate: Date; endDate: Date }
) => {
  const startDateStr = formatDateToYYYYMMDD(dateRange.startDate);
  const endDateStr = formatDateToYYYYMMDD(dateRange.endDate);
  
  const relevantRecords = attendanceRecords.filter(record => 
    record.date >= startDateStr && record.date <= endDateStr
  );
  
  const totalPossibleAttendances = members.length * getSundaysInRange(dateRange.startDate, dateRange.endDate).length;
  const totalActualAttendances = relevantRecords.filter(r => r.status === 'Present').length;
  const overallRate = totalPossibleAttendances > 0 ? Math.round((totalActualAttendances / totalPossibleAttendances) * 100) : 0;
  
  return {
    totalMembers: members.length,
    totalServices: getSundaysInRange(dateRange.startDate, dateRange.endDate).length,
    totalPossibleAttendances,
    totalActualAttendances,
    overallRate,
    absentCount: relevantRecords.filter(r => r.status === 'Absent').length
  };
};

// Helper function to get Sundays in a date range
const getSundaysInRange = (startDate: Date, endDate: Date): Date[] => {
  const sundays: Date[] = [];
  const current = new Date(startDate);
  
  // Find first Sunday
  while (current.getDay() !== 0) {
    current.setDate(current.getDate() + 1);
  }
  
  // Collect all Sundays in range
  while (current <= endDate) {
    sundays.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }
  
  return sundays;
};

// Create summary worksheet
const createSummaryWorksheet = (data: ExcelData) => {
  const { members, bacentas, attendanceRecords, options } = data;
  const stats = calculateAttendanceStats(members, attendanceRecords, options.dateRange);
  
  const summaryData = [
    ['Church Connect Mobile - Summary Report'],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Date Range:', `${options.dateRange.startDate.toLocaleDateString()} - ${options.dateRange.endDate.toLocaleDateString()}`],
    [],
    ['OVERVIEW STATISTICS'],
    ['Total Members:', stats.totalMembers],
    ['Total Bacentas:', bacentas.length],
    ['Total Services:', stats.totalServices],
    ['Overall Attendance Rate:', `${stats.overallRate}%`],
    ['Total Present:', stats.totalActualAttendances],
    ['Total Absent:', stats.absentCount],
    [],
    ['BACENTA BREAKDOWN'],
    ['Bacenta Name', 'Members', 'Attendance Rate', 'Total Attendances']
  ];
  
  // Add bacenta statistics
  bacentas.forEach(bacenta => {
    const bacentaMembers = members.filter(m => m.bacentaId === bacenta.id);
    const bacentaStats = calculateAttendanceStats(bacentaMembers, attendanceRecords, options.dateRange);
    
    summaryData.push([
      bacenta.name,
      bacentaStats.totalMembers,
      `${bacentaStats.overallRate}%`,
      bacentaStats.totalActualAttendances
    ]);
  });
  
  return XLSX.utils.aoa_to_sheet(summaryData);
};

// Create individual bacenta worksheet
const createBacentaWorksheet = (bacenta: Bacenta, data: ExcelData) => {
  const { members, attendanceRecords, options } = data;
  const bacentaMembers = members.filter(m => m.bacentaId === bacenta.id);
  const sundays = getSundaysInRange(options.dateRange.startDate, options.dateRange.endDate);
  
  // Header
  const worksheetData = [
    [`${bacenta.name} - Detailed Report`],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Date Range:', `${options.dateRange.startDate.toLocaleDateString()} - ${options.dateRange.endDate.toLocaleDateString()}`],
    [],
    ['MEMBERS & ATTENDANCE']
  ];
  
  // Create attendance table header
  const headerRow = ['Member Name', 'Phone', 'Born Again', 'Join Date'];
  sundays.forEach(sunday => {
    headerRow.push(sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  });
  headerRow.push('Total Present', 'Attendance Rate');
  worksheetData.push(headerRow);
  
  // Add member data with attendance
  bacentaMembers.forEach(member => {
    const memberRow = [
      `${member.firstName} ${member.lastName}`,
      options.includePersonalInfo ? member.phoneNumber : 'Hidden',
      member.bornAgainStatus ? 'Yes' : 'No',
      new Date(member.joinedDate).toLocaleDateString()
    ];
    
    let presentCount = 0;
    sundays.forEach(sunday => {
      const dateStr = formatDateToYYYYMMDD(sunday);
      const record = attendanceRecords.find(r => r.memberId === member.id && r.date === dateStr);
      const status = record ? record.status : 'Absent';
      memberRow.push(status === 'Present' ? 'P' : 'A');
      if (status === 'Present') presentCount++;
    });
    
    const attendanceRate = sundays.length > 0 ? Math.round((presentCount / sundays.length) * 100) : 0;
    memberRow.push(presentCount, `${attendanceRate}%`);
    
    worksheetData.push(memberRow);
  });
  
  return XLSX.utils.aoa_to_sheet(worksheetData);
};

// Create all members worksheet
const createAllMembersWorksheet = (data: ExcelData) => {
  const { members, bacentas, options } = data;
  
  const worksheetData = [
    ['All Members Directory'],
    ['Generated on:', new Date().toLocaleDateString()],
    [],
    ['First Name', 'Last Name', 'Phone', 'Address', 'Bacenta', 'Born Again', 'Join Date', 'Member Since']
  ];
  
  members.forEach(member => {
    const bacenta = bacentas.find(b => b.id === member.bacentaId);
    const memberSince = Math.floor((Date.now() - new Date(member.joinedDate).getTime()) / (1000 * 60 * 60 * 24));
    
    worksheetData.push([
      member.firstName,
      member.lastName,
      options.includePersonalInfo ? member.phoneNumber : 'Hidden',
      options.includePersonalInfo ? member.buildingAddress : 'Hidden',
      bacenta ? bacenta.name : 'Unassigned',
      member.bornAgainStatus ? 'Yes' : 'No',
      new Date(member.joinedDate).toLocaleDateString(),
      `${memberSince} days`
    ]);
  });
  
  return XLSX.utils.aoa_to_sheet(worksheetData);
};

// Create attendance analytics worksheet
const createAttendanceAnalyticsWorksheet = (data: ExcelData) => {
  const { members, attendanceRecords, options } = data;
  const sundays = getSundaysInRange(options.dateRange.startDate, options.dateRange.endDate);

  const worksheetData = [
    ['Attendance Analytics Report'],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Date Range:', `${options.dateRange.startDate.toLocaleDateString()} - ${options.dateRange.endDate.toLocaleDateString()}`],
    [],
    ['WEEKLY ATTENDANCE BREAKDOWN'],
    ['Date', 'Total Present', 'Total Absent', 'Attendance Rate']
  ];

  // Weekly breakdown
  sundays.forEach(sunday => {
    const dateStr = formatDateToYYYYMMDD(sunday);
    const dayRecords = attendanceRecords.filter(r => r.date === dateStr);
    const presentCount = dayRecords.filter(r => r.status === 'Present').length;
    const absentCount = dayRecords.filter(r => r.status === 'Absent').length;
    const rate = (presentCount + absentCount) > 0 ? Math.round((presentCount / (presentCount + absentCount)) * 100) : 0;

    worksheetData.push([
      sunday.toLocaleDateString(),
      presentCount.toString(),
      absentCount.toString(),
      `${rate}%`
    ]);
  });

  // Add member performance analysis
  worksheetData.push([]);
  worksheetData.push(['MEMBER PERFORMANCE ANALYSIS']);
  worksheetData.push(['Member Name', 'Total Present', 'Total Absent', 'Attendance Rate', 'Status']);

  members.forEach(member => {
    const memberRecords = attendanceRecords.filter(r =>
      r.memberId === member.id &&
      r.date >= formatDateToYYYYMMDD(options.dateRange.startDate) &&
      r.date <= formatDateToYYYYMMDD(options.dateRange.endDate)
    );

    const presentCount = memberRecords.filter(r => r.status === 'Present').length;
    const absentCount = memberRecords.filter(r => r.status === 'Absent').length;
    const total = presentCount + absentCount;
    const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

    let status = 'Good';
    if (rate < 50) status = 'Critical';
    else if (rate < 70) status = 'Needs Attention';
    else if (rate >= 90) status = 'Excellent';

    worksheetData.push([
      `${member.firstName} ${member.lastName}`,
      presentCount.toString(),
      absentCount.toString(),
      `${rate}%`,
      status
    ]);
  });

  return XLSX.utils.aoa_to_sheet(worksheetData);
};

// Create monthly trends worksheet
const createMonthlyTrendsWorksheet = (data: ExcelData) => {
  const { members, attendanceRecords, options } = data;

  // Group data by month
  const monthlyData = new Map<string, { present: number; absent: number; total: number }>();

  attendanceRecords.forEach(record => {
    const recordDate = new Date(record.date);
    if (recordDate >= options.dateRange.startDate && recordDate <= options.dateRange.endDate) {
      const monthKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { present: 0, absent: 0, total: 0 });
      }

      const monthStats = monthlyData.get(monthKey)!;
      if (record.status === 'Present') {
        monthStats.present++;
      } else {
        monthStats.absent++;
      }
      monthStats.total++;
    }
  });

  const worksheetData = [
    ['Monthly Attendance Trends'],
    ['Generated on:', new Date().toLocaleDateString()],
    ['Date Range:', `${options.dateRange.startDate.toLocaleDateString()} - ${options.dateRange.endDate.toLocaleDateString()}`],
    [],
    ['Month', 'Total Present', 'Total Absent', 'Attendance Rate', 'Trend']
  ];

  const sortedMonths = Array.from(monthlyData.entries()).sort(([a], [b]) => a.localeCompare(b));
  let previousRate = 0;

  sortedMonths.forEach(([monthKey, stats], index) => {
    const [year, month] = monthKey.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });

    const rate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
    let trend = 'Stable';

    if (index > 0) {
      if (rate > previousRate + 5) trend = 'Improving';
      else if (rate < previousRate - 5) trend = 'Declining';
    }

    worksheetData.push([
      monthName,
      stats.present.toString(),
      stats.absent.toString(),
      `${rate}%`,
      trend
    ]);

    previousRate = rate;
  });

  return XLSX.utils.aoa_to_sheet(worksheetData);
};

// Apply styling to worksheets
const applyWorksheetStyling = (worksheet: XLSX.WorkSheet) => {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  // Set column widths
  worksheet['!cols'] = [];
  for (let col = 0; col <= range.e.c; col++) {
    worksheet['!cols'][col] = { width: 15 };
  }

  // Make first few columns wider for names
  if (worksheet['!cols'][0]) worksheet['!cols'][0].width = 25;
  if (worksheet['!cols'][1]) worksheet['!cols'][1].width = 20;

  return worksheet;
};

// Main export function
export const exportToExcel = async (data: ExcelData): Promise<void> => {
  const { members, bacentas, options } = data;

  // Filter bacentas if specific ones are selected
  const targetBacentas = options.selectedBacentas.length > 0
    ? bacentas.filter(b => options.selectedBacentas.includes(b.id))
    : bacentas;

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Add Summary worksheet
  const summaryWs = applyWorksheetStyling(createSummaryWorksheet(data));
  XLSX.utils.book_append_sheet(workbook, summaryWs, 'Summary');

  // Add individual Bacenta worksheets
  targetBacentas.forEach(bacenta => {
    const bacentaWs = applyWorksheetStyling(createBacentaWorksheet(bacenta, data));
    // Truncate sheet name to Excel's 31 character limit
    const sheetName = bacenta.name.length > 31 ? bacenta.name.substring(0, 28) + '...' : bacenta.name;
    XLSX.utils.book_append_sheet(workbook, bacentaWs, sheetName);
  });

  // Add All Members worksheet
  const allMembersWs = applyWorksheetStyling(createAllMembersWorksheet(data));
  XLSX.utils.book_append_sheet(workbook, allMembersWs, 'All Members');

  // Add Attendance Analytics worksheet
  const analyticsWs = applyWorksheetStyling(createAttendanceAnalyticsWorksheet(data));
  XLSX.utils.book_append_sheet(workbook, analyticsWs, 'Analytics');

  // Add Monthly Trends worksheet
  const trendsWs = applyWorksheetStyling(createMonthlyTrendsWorksheet(data));
  XLSX.utils.book_append_sheet(workbook, trendsWs, 'Monthly Trends');

  // Generate filename
  const startDate = options.dateRange.startDate.toISOString().split('T')[0];
  const endDate = options.dateRange.endDate.toISOString().split('T')[0];
  const filename = `church-connect-report-${startDate}-to-${endDate}.xlsx`;

  // Export file
  XLSX.writeFile(workbook, filename);
};
