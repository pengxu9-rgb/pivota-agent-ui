export type InterleavedItem<Product, Service> =
  | { kind: 'product'; data: Product }
  | { kind: 'service'; data: Service };

export function interleaveServices<Product, Service>(
  products: Product[],
  services: Service[],
  layout: 'mobile' | 'desktop' = 'mobile',
): Array<InterleavedItem<Product, Service>> {
  const productQueue = [...products];
  const serviceQueue = [...services];
  const totalSlots = layout === 'desktop' ? 8 : 10;
  const serviceSlots = new Set(layout === 'desktop' ? [2, 5] : [1, 4, 8]);
  const output: Array<InterleavedItem<Product, Service>> = [];

  for (let index = 0; index < totalSlots; index += 1) {
    if (serviceSlots.has(index) && serviceQueue.length) {
      output.push({ kind: 'service', data: serviceQueue.shift() as Service });
      continue;
    }
    if (productQueue.length) {
      output.push({ kind: 'product', data: productQueue.shift() as Product });
      continue;
    }
    if (serviceQueue.length) {
      output.push({ kind: 'service', data: serviceQueue.shift() as Service });
    }
  }

  return output;
}
