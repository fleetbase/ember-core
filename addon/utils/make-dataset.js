import groupBy from './group-by';
import { _range } from './range';
import moment from 'moment';

function randomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}

function randomDateThisMonth() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    randomInt(0, 29),
    randomInt(0, 60)
  );
}

function makeMockDataset(start, end, dateProperty = 'created_at') {
  const data = _range(start, end).map(() => {
    return {
      created_at: randomDateThisMonth(),
    };
  });
  const grouped = groupBy(data, (record) => {
    return moment(new Date(record[dateProperty])).format('MMMM, DD YYYY');
  });
  const dataset = [];

  for (let day in grouped) {
    dataset.pushObject({
      t: new Date(`${day} 00:00:00`),
      y: grouped[day].length,
    });
  }

  return dataset.sortBy('t');
}

export { makeMockDataset, randomInt, randomDateThisMonth, _range as range };

export default function makeDataset(
  recordArray,
  filter = Boolean,
  dateProperty = 'created_at'
) {
  const filteredData = recordArray.filter(filter);
  const grouped = groupBy(filteredData, (record) => {
    return moment(new Date(record[dateProperty])).format('MMMM, DD YYYY');
  });
  const dataset = [];

  for (let day in grouped) {
    dataset.pushObject({
      t: new Date(`${day} 00:00:00`),
      y: grouped[day].length,
    });
  }

  return dataset.sortBy('t');
}
