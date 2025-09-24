import { TOGGLE_TRACK_CLASS_NAME } from '../../app/components/common/toggleStyles';

describe('Toggle Styles Utility', () => {
   it('should export a valid CSS class string', () => {
      expect(TOGGLE_TRACK_CLASS_NAME).toBeDefined();
      expect(typeof TOGGLE_TRACK_CLASS_NAME).toBe('string');
      expect(TOGGLE_TRACK_CLASS_NAME.length).toBeGreaterThan(0);
   });

   it('should contain all required toggle styling classes', () => {
      const requiredClasses = [
         'relative',
         'rounded-3xl',
         'peer-focus:outline-none',
         'peer-checked:after:translate-x-full',
         'after:content-[\'\']',
         'peer-checked:bg-blue-600'
      ];

      requiredClasses.forEach(className => {
         expect(TOGGLE_TRACK_CLASS_NAME).toContain(className);
      });
   });

   it('should be a space-separated string of CSS classes', () => {
      const classes = TOGGLE_TRACK_CLASS_NAME.split(' ');
      expect(classes.length).toBeGreaterThan(5);
      
      // Ensure no empty strings from extra spaces
      classes.forEach(className => {
         expect(className.trim()).toBeTruthy();
      });
   });
});