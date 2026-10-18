import jsPDF from 'jspdf';
// html2canvas-pro instead of html2canvas: Tailwind 4 colors are oklch(), which the
// original cannot read (it fails on every section).
import html2canvas from 'html2canvas-pro';

// Builds the PDF report from the page's .pdf-section blocks and downloads it.
// Everything it needs comes in as arguments; it reads no component state.
export const generatePDFReport = async ({ scenarios, activeScenarioId, calculateScenario, pdfReportMode }) => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;

    // Get current scenario data
    const activeScenario = scenarios.find(s => s.id === activeScenarioId) || scenarios[0];
    const results = activeScenario ? calculateScenario(activeScenario) : null;

    if (!results) {
      alert('No scenario data available to generate report');
      return;
    }

    // Helper function to add section image to PDF
    const addSectionToPDF = async (selector, title) => {
      const element = document.querySelector(selector);
      if (!element) {
        console.warn(`Section not found: ${selector}`);
        return false;
      }

      try {
        const canvas = await html2canvas(element, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Check if we need a new page
        if (yPosition + imgHeight > pageHeight - 20) {
          pdf.addPage();
          yPosition = 20;
        }

        // Add title if provided
        if (title) {
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          pdf.text(title, margin, yPosition);
          yPosition += 8;
        }

        pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;

        return true;
      } catch (error) {
        console.error(`Error capturing ${selector}:`, error);
        return false;
      }
    };

    // Title Page
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    const reportTitle = pdfReportMode === 'summary'
      ? 'Retirement Tax Planning Report (Summary)'
      : 'Retirement Tax Planning Report (Full)';
    pdf.text(reportTitle, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Scenario: ${activeScenario.name}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 5;
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Capture all webpage sections
    console.log('Generating PDF report...');

    // Find all results sections and capture them
    let sections;
    if (pdfReportMode === 'summary') {
      // Exclude detail sections in summary mode
      sections = Array.from(document.querySelectorAll('.pdf-section')).filter(
        section => !section.classList.contains('pdf-detail-only')
      );
    } else {
      sections = document.querySelectorAll('.pdf-section');
    }

    let captured = 0;
    for (const section of sections) {
      try {
        const canvas = await html2canvas(section, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        const topMargin = 20;
        const bottomMargin = 20;
        const maxImgHeight = pageHeight - topMargin - bottomMargin;

        let imgWidth = pageWidth - 2 * margin;
        let imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Start a new page if this section will not fit in what is left.
        if (yPosition + imgHeight > pageHeight - bottomMargin) {
          pdf.addPage();
          yPosition = topMargin;
        }

        // A section taller than a whole page still will not fit after the page
        // break. Previously it was drawn at full height anyway: addImage clipped
        // everything past the bottom edge, and yPosition advanced beyond
        // pageHeight so the NEXT section started off-page too. Scale it down to
        // fit instead, keeping the aspect ratio and centring the narrower image.
        if (imgHeight > maxImgHeight) {
          imgWidth = (imgWidth * maxImgHeight) / imgHeight;
          imgHeight = maxImgHeight;
        }

        const imgX = (pageWidth - imgWidth) / 2;
        pdf.addImage(imgData, 'PNG', imgX, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;
        captured += 1;
      } catch (error) {
        console.error('Error capturing section:', error);
      }
    }

    // If nothing could be captured the report would be a title page and nothing else.
    if (captured === 0) {
      alert('The report could not be built: none of the page sections could be captured. Open the browser console for details.');
      return;
    }

    // Save PDF
    pdf.save(`retirement-tax-report-${activeScenario.name}-${new Date().toISOString().split('T')[0]}.pdf`);
    console.log('PDF generated successfully');

  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF report. Please check the console for details.');
  }
};
