import destBrasil from "@/assets/dest-brasil.jpg";
import destBrasilNew from "@/assets/dest-brasil-new.png";
import destSudeste from "@/assets/dest-sudeste.jpg";
import destSudesteNew from "@/assets/dest-sudeste-new.png";
import destSulNew from "@/assets/dest-sul-new.png";
import destCentroOesteNew from "@/assets/dest-centro-oeste-new.png";
import destNorteNew from "@/assets/dest-norte-new.png";
import destNordesteNew from "@/assets/dest-nordeste-new.png";
import destUSA from "@/assets/dest-usa.jpg";
import destEuaNew from "@/assets/dest-eua-new.png";
import destPortugal from "@/assets/dest-portugal.jpg";
import destPortugalNew from "@/assets/dest-portugal-new.png";
import destEspanhaNew from "@/assets/dest-espanha-new.png";
import destReinoUnidoNew from "@/assets/dest-reino-unido-new.png";
import destFrancaNew from "@/assets/dest-franca-new.png";
import destAlemanhaNew from "@/assets/dest-alemanha-new.png";
import destArgentinaNew from "@/assets/dest-argentina-new.png";
import destItaliaNew from "@/assets/dest-italia-new.png";
import destChileNew from "@/assets/dest-chile-new.png";
import destPeruNew from "@/assets/dest-peru-new.png";
import destMexicoNew from "@/assets/dest-mexico-new.png";
import destUruguaiNew from "@/assets/dest-uruguai-new.png";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import AirlineLogo from "@/components/AirlineLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { useDestinationBestPrices } from "@/hooks/useDestinationBestPrices";

type DestinationCard = {
  code: string;
  name: string;
  image: string;
};

type DestinationCarouselProps = {
  origins: string[];
  onDestinationClick?: (destination: { code: string; name: string }) => void;
};

const CARD_IMAGES = [destBrasil, destSudeste, destUSA, destPortugal];

const REGION_DESTINATIONS: DestinationCard[] = [
  { code: "BRA", name: "Brasil", image: destBrasilNew },
  { code: "SAO", name: "Sudeste", image: destSudesteNew },
  { code: "CWB", name: "Sul", image: destSulNew },
  { code: "BSB", name: "Centro Oeste", image: destCentroOesteNew },
  { code: "MAO", name: "Norte", image: destNorteNew },
  { code: "REC", name: "Nordeste", image: destNordesteNew },
];

const INTERNATIONAL_DESTINATIONS: DestinationCard[] = [
  { code: "NYC", name: "Estados Unidos", image: destEuaNew },
  { code: "LIS", name: "Portugal", image: destPortugalNew },
  { code: "MAD", name: "Espanha", image: destEspanhaNew },
  { code: "LON", name: "Reino Unido", image: destReinoUnidoNew },
  { code: "PAR", name: "França", image: destFrancaNew },
  { code: "BER", name: "Alemanha", image: destAlemanhaNew },
  { code: "BUE", name: "Argentina", image: destArgentinaNew },
  { code: "ROM", name: "Italia", image: destItaliaNew },
  { code: "SCL", name: "Chile", image: destChileNew },
  { code: "LIM", name: "Peru", image: destPeruNew },
  { code: "MEX", name: "Mexico", image: destMexicoNew },
  { code: "MVD", name: "Uruguai", image: destUruguaiNew },
];
const ALL_DESTINATIONS = [...REGION_DESTINATIONS, ...INTERNATIONAL_DESTINATIONS];
const DESTINATION_CODES = ALL_DESTINATIONS.map((destination) => destination.code);

const formatMiles = (value: number | null) =>
  value === null ? "--" : `${value.toLocaleString("pt-BR")} pts`;

const formatMoney = (value: number | null) =>
  value === null
    ? "--"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DestinationCarousel = ({
  origins,
  onDestinationClick,
}: DestinationCarouselProps) => {
  const { loading, pricesByDestination } = useDestinationBestPrices({
    destinations: DESTINATION_CODES,
    origins,
  });

  const renderRow = (destinations: DestinationCard[]) => (
    <Carousel
      opts={{
        align: "start",
        dragFree: true,
        containScroll: "trimSnaps",
      }}
      className="w-full"
    >
      <CarouselContent className="-ml-2">
        {loading &&
          destinations.map((destination) => (
            <CarouselItem
              key={`skeleton-${destination.code}`}
              className="basis-[46%] pl-2 sm:basis-[38%]"
            >
              <div className="overflow-hidden rounded-[14px] bg-white p-2.5 shadow-nubank">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="mt-2.5 h-4 w-20" />
                <Skeleton className="mt-2 h-3.5 w-full" />
                <Skeleton className="mt-1.5 h-3.5 w-5/6" />
              </div>
            </CarouselItem>
          ))}

        {!loading &&
          destinations.map((destination) => {
            const data = pricesByDestination[destination.code];
            const miles = data?.miles;
            const money = data?.money;

            return (
              <CarouselItem
                key={destination.code}
                className="basis-[46%] pl-2 sm:basis-[38%]"
              >
                <button
                  type="button"
                  onClick={() =>
                    onDestinationClick?.({ code: destination.code, name: destination.name })
                  }
                  className="w-full overflow-hidden rounded-[14px] gradient-card-subtle p-2.5 text-left shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5"
                >
                  <div className="relative h-20 overflow-hidden rounded-xl">
                    <img
                      src={destination.image}
                      alt={destination.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                    <span className="absolute bottom-1.5 left-2 text-sm font-semibold text-white">
                      {destination.name}
                    </span>
                  </div>

                  <div className="mt-1.5 rounded-lg bg-nubank-bg px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-nubank-text">
                        {formatMiles(miles?.bestPrice ?? null)}
                      </p>
                      <AirlineLogo airline={miles?.airline} size={16} />
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-[11px] text-nubank-text-secondary">
                        {formatMoney(money?.bestPrice ?? null)}
                      </p>
                      <AirlineLogo airline={money?.airline} size={16} />
                    </div>
                  </div>
                </button>
              </CarouselItem>
            );
          })}
      </CarouselContent>
    </Carousel>
  );

  return (
    <section className="px-5 py-4">
      <div className="mb-3">
        <h2 className="text-lg font-bold tracking-tight text-nubank-text">Destinos em destaque</h2>
        <p className="mt-0.5 text-xs text-nubank-text-secondary">
          Melhores preços por região com base nas origens habilitadas.
        </p>
      </div>
      {renderRow(REGION_DESTINATIONS)}
      <div className="mt-4">{renderRow(INTERNATIONAL_DESTINATIONS)}</div>
    </section>
  );
};

export default DestinationCarousel;
