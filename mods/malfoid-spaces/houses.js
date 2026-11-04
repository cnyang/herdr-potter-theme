const HOUSES = ["slytherin", "gryffindor", "ravenclaw", "hufflepuff"];

export function housePath(index) {
  return `mods/malfoid-spaces/art/${HOUSES[index % HOUSES.length]}.png`;
}
