import type { SVGProps } from 'react';

type LogoProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'width' | 'height'> & {
   size?: number;
   title?: string;
};

/** The SerpBear bear mark. The body takes the current text color, so it follows the surrounding theme. */
export function Logo({ size = 24, title, ...props }: LogoProps) {
   return (
      <svg
         xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 1484.32 1348.5"
         width={size}
         height={size * (1348.5 / 1484.32)}
         role={title ? 'img' : undefined}
         aria-hidden={title ? undefined : true}
         {...props}
      >
         {title && <title>{title}</title>}
         <g transform="translate(-1177.84 -405.75)">
            <path
               fill="currentColor"
               d="M1406.23,604.17s-44-158.18,40.43-192.67,195,97.52,195,97.52,314-65.41,534,0c0,0,122.16-105.61,214.68-80.28,99.9,27.36,32.7,181.38,32.7,181.38s228.36,384.15,239.06,737.38c0,0-346.1,346.09-746.9,406.75,0,0-527.47-106.44-737.38-449.57C1177.88,1304.68,1169.55,1008.54,1406.23,604.17Z"
            />
            <path
               fill="white"
               d="M1920.79,873S1659,855,1635,1275c0,0-19,182,304.82,178.35,244-2.75,260.55-118.61,266.41-182C2212,1209,2131,874,1920.79,873Z"
            />
            <path
               fill="currentColor"
               d="M1930.07,1194.67s143.91,5.95,116.55,94-118.93,83.25-118.93,83.25-96.34,0-134.4-95.15C1764.45,1204.62,1930.07,1194.67,1930.07,1194.67Z"
            />
         </g>
      </svg>
   );
}
