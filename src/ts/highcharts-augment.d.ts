import {} from 'highcharts/highstock';

declare module 'highcharts/highstock' {
    interface AxisLabelsFormatterContextObject {
        tickPositionInfo?: {
            unitName: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
            count: number;
            unitRange: number;
            higherRanks?: Record<number, string>;
            totalRange?: number;
        };
    }

    interface Series {
        xData?: number[];
        yData?: (number | null)[];
        processedXData?: number[];
        processedYData?: (number | null)[];
    }
}
