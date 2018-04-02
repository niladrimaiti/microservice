FROM java:8

WORKDIR /

ADD currency-exchange-service-0.0.1-SNAPSHOT.jar  /opt/

EXPOSE 8000

CMD java  -Xms210m -Xmx210m  -jar /opt/currency_exchange.jar
