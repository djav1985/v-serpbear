import { createRoute } from '../../../../utils/apiLogging';
import { serveBrandImage } from '../../../../utils/api/brandImage';

/** The tab icon: data/favicon.png when white-label is on and the file exists, otherwise the bundled default. Public. */
export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'images/favicon', auth: false, GET: () => serveBrandImage('favicon.png') });
