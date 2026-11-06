/**
 * Shared toggle/switch styling constants for unified domain status toggles.
 * Centralizes the styling to prevent duplication and ensure consistency.
 */
export const TOGGLE_TRACK_CLASS_NAME = [
   'relative rounded-3xl w-9 h-5 bg-gray-200',
   'peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300',
   'dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700',
   'peer-checked:after:translate-x-full peer-checked:after:border-white',
   "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300",
   'after:border after:rounded-full after:h-4 after:w-4 after:transition-all',
   'dark:border-gray-600 peer-checked:bg-blue-600',
].join(' ');