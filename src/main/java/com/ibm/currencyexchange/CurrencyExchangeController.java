package com.ibm.currencyexchange;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ibm.currencyexchange.bean.CurrencyExchangeBean;



@RestController
public class CurrencyExchangeController {
	
	@RequestMapping("/currencyExchange/from/{from}/to/{to}")
	public CurrencyExchangeBean retrieveCurrencyExchange(@PathVariable String from,@PathVariable String to) {
		
		return new CurrencyExchangeBean(from,to,80);
		
	}

}
