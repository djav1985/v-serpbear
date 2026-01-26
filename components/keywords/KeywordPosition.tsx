import Icon from '../common/Icon';

type KeywordPositionProps = {
   position: number,
   updating?: number,
   type?: string,
}

const KeywordPosition = ({ position = 0, type = '', updating = 0 }:KeywordPositionProps) => {
   const isUpdating = updating === 1;

   if (!isUpdating && position === 0) {
      return <span className='text-gray-400' title='Not in Top 100'>{'>100'}</span>;
   }
   if (isUpdating && type !== 'sc') {
      return <span title='Updating Keyword Position'><Icon type="loading" /></span>;
   }
   return <>{Math.round(position)}</>;
};

export default KeywordPosition;
