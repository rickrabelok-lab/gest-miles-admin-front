export type AirportOption = {
  code: string;
  city: string;
  name: string;
  country: string;
};

export const AIRPORTS: AirportOption[] = [
  { code: "CNF", city: "Belo Horizonte", name: "Confins", country: "Brasil" },
  { code: "GRU", city: "Sao Paulo", name: "Guarulhos", country: "Brasil" },
  { code: "CGH", city: "Sao Paulo", name: "Congonhas", country: "Brasil" },
  { code: "GIG", city: "Rio de Janeiro", name: "Galeao", country: "Brasil" },
  { code: "SDU", city: "Rio de Janeiro", name: "Santos Dumont", country: "Brasil" },
  { code: "BSB", city: "Brasilia", name: "Juscelino Kubitschek", country: "Brasil" },
  { code: "CWB", city: "Curitiba", name: "Afonso Pena", country: "Brasil" },
  { code: "POA", city: "Porto Alegre", name: "Salgado Filho", country: "Brasil" },
  { code: "MAO", city: "Manaus", name: "Eduardo Gomes", country: "Brasil" },
  { code: "BEL", city: "Belem", name: "Val de Caes", country: "Brasil" },
  { code: "REC", city: "Recife", name: "Guararapes", country: "Brasil" },
  { code: "FOR", city: "Fortaleza", name: "Pinto Martins", country: "Brasil" },
  { code: "SSA", city: "Salvador", name: "Deputado Luis Eduardo", country: "Brasil" },
  { code: "JPA", city: "Joao Pessoa", name: "Castro Pinto", country: "Brasil" },
  { code: "MVD", city: "Montevideo", name: "Carrasco", country: "Uruguai" },
  { code: "EZE", city: "Buenos Aires", name: "Ezeiza", country: "Argentina" },
  { code: "SCL", city: "Santiago", name: "Arturo Merino", country: "Chile" },
  { code: "LIM", city: "Lima", name: "Jorge Chavez", country: "Peru" },
  { code: "MEX", city: "Cidade do Mexico", name: "AICM", country: "Mexico" },
  { code: "JFK", city: "Nova York", name: "John F. Kennedy", country: "Estados Unidos" },
  { code: "MIA", city: "Miami", name: "Miami International", country: "Estados Unidos" },
  { code: "LIS", city: "Lisboa", name: "Humberto Delgado", country: "Portugal" },
  { code: "MAD", city: "Madri", name: "Barajas", country: "Espanha" },
  { code: "LHR", city: "Londres", name: "Heathrow", country: "Reino Unido" },
  { code: "CDG", city: "Paris", name: "Charles de Gaulle", country: "Franca" },
  { code: "FRA", city: "Frankfurt", name: "Frankfurt Airport", country: "Alemanha" },
  { code: "FCO", city: "Roma", name: "Fiumicino", country: "Italia" },
];

export const CARD_DESTINATION_TO_AIRPORT_CODE: Record<string, string> = {
  BRA: "GRU",
  SAO: "CGH",
  CWB: "CWB",
  BSB: "BSB",
  MAO: "MAO",
  REC: "REC",
  NYC: "JFK",
  LIS: "LIS",
  MAD: "MAD",
  LON: "LHR",
  PAR: "CDG",
  BER: "FRA",
  BUE: "EZE",
  ROM: "FCO",
  SCL: "SCL",
  LIM: "LIM",
  MEX: "MEX",
  MVD: "MVD",
};

export const formatAirportLabel = (airport: AirportOption) =>
  `${airport.city} - ${airport.code}`;

export const findAirportByCode = (code?: string | null) =>
  AIRPORTS.find((airport) => airport.code === (code ?? "").trim().toUpperCase()) ?? null;
