import { createRoute } from '../../../../utils/apiLogging';
import { serveBrandImage } from '../../../../utils/api/brandImage';

/** The logo: data/logo.png when white-label is on and the file exists, otherwise the bundled default. Public. */
export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'images/logo', auth: false, GET: () => serveBrandImage('logo.png') });
